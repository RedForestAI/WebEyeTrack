import time
import pathlib
from typing import Union, Any, Tuple, Optional, List, Literal
from dataclasses import dataclass, field
import random

import tensorflow as tf
import cv2
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import mediapipe as mp

from .filter import KalmanFilter2D
from .constants import FACE_LANDMARKER_PATH, BLAZEGAZE_PATH
from .model_based import (
    obtain_eyepatch, 
    get_head_vector,
    estimate_face_width,
    estimate_camera_intrinsics,
    create_perspective_matrix,
    face_reconstruction,
    estimate_gaze_origins,
    compute_ear
)
from .data_protocols import GazeResult, TrackingStatus
from .blazegaze import BlazeGaze, BlazeGazeConfig

def mae_cm_loss(y_true, y_pred, screen_info):
    """
    Convert normalized predictions and labels to cm using screen_info
    and compute MAE in cm.

    Args:
        y_true: Tensor of shape (batch_size, 2), normalized labels [0,1]
        y_pred: Tensor of shape (batch_size, 2), normalized predictions [0,1]
        screen_info: Tensor of shape (batch_size, 2), in cm: [height, width]

    Returns:
        Scalar MAE loss in cm
    """
    # Convert from normalized [0,1] to cm by multiplying by screen dimensions
    true_cm = y_true * screen_info
    pred_cm = y_pred * screen_info

    return tf.reduce_mean(tf.abs(true_cm - pred_cm))  # MAE in cm

def l2_loss(y_true, y_pred, sample_weight=None):
    """
    Compute L2 loss between true and predicted values, optionally weighted.
    
    Args:
        y_true: Tensor of shape (B, 2)
        y_pred: Tensor of shape (B, 2)
        sample_weight: Optional tensor of shape (B,)
    Returns:
        Scalar loss.
    """
    loss = tf.reduce_sum(tf.square(y_pred - y_true), axis=-1)  # (B,)

    if sample_weight is not None:
        sample_weight = tf.cast(sample_weight, tf.float32)
        loss = loss * sample_weight
        return tf.reduce_mean(loss)
    else:
        return tf.reduce_mean(loss)

def list_to_tensor(input_list: list, dtype=tf.float32):
    return tf.convert_to_tensor(np.stack(input_list), dtype=dtype)

def list_to_concat_tensor(input_list: list, dtype=tf.float32, dim=0):
    """
    Convert a list of tensors to a single concatenated tensor along the specified dimension.
    
    Args:
        input_list: List of tensors to concatenate.
        dtype: Data type of the resulting tensor.
        dim: Dimension along which to concatenate.
    
    Returns:
        A single concatenated tensor.
    """
    return tf.concat([tf.convert_to_tensor(x, dtype=dtype) for x in input_list], axis=dim)

def generate_support_and_query_samples(
        eye_patches, 
        head_vectors, 
        face_origin_3ds, 
        pog_norms, 
        screen_cm_dimensions,
        split_ratio=0.7
    ):

    # Shuffle in unison to ensure
    # combined = list(zip(eye_patches, head_vectors, face_origin_3ds, pog_norms))
    # random.shuffle(combined)
    # eye_patches, head_vectors, face_origin_3ds, pog_norms = zip(*combined)

    # Do a 0.7/0.3 split for support and query sets, in a random fashion
    split_index = int(split_ratio * len(eye_patches))
    support_x_eyes = eye_patches[:split_index]
    support_x_head = head_vectors[:split_index]
    support_x_face = face_origin_3ds[:split_index]
    support_x_screen_info = [screen_cm_dimensions] * split_index
    support_y = list_to_tensor(pog_norms[:split_index])

    support_x = {
        'image': list_to_tensor(support_x_eyes, dtype=tf.float32) / 255.0,
        'head_vector': list_to_tensor(support_x_head, dtype=tf.float32),
        'face_origin_3d': list_to_tensor(support_x_face, dtype=tf.float32),
        'screen_info': list_to_tensor(support_x_screen_info, dtype=tf.float32)
    }

    if split_ratio != 1:
        query_x_eyes = eye_patches[split_index:]
        query_x_head = head_vectors[split_index:]
        query_x_face = face_origin_3ds[split_index:]
        query_x_screen_info = [screen_cm_dimensions] * (len(eye_patches) - split_index)
        query_y = list_to_tensor(pog_norms[split_index:])
        query_x = {
            'image': list_to_tensor(query_x_eyes, dtype=tf.float32) / 255.0,
            'head_vector': list_to_tensor(query_x_head, dtype=tf.float32),
            'face_origin_3d': list_to_tensor(query_x_face, dtype=tf.float32),
            'screen_info': list_to_tensor(query_x_screen_info, dtype=tf.float32)
        }
    else:
        query_x = None
        query_y = None

    return support_x, support_y, query_x, query_y

def compute_affine_transform(src: np.ndarray, dst: np.ndarray):
    """
    Computes the affine transform matrix that maps src → dst via least squares.

    Args:
        src: (N, 2) source points (predicted)
        dst: (N, 2) destination points (ground truth)

    Returns:
        A 2x3 affine matrix for transforming src to dst.
    """
    assert src.shape == dst.shape and src.shape[1] == 2, "Shape must be (N, 2)"

    # Add column of ones to src to allow affine transform (2x3 matrix)
    src_aug = np.hstack([src, np.ones((src.shape[0], 1))])  # (N, 3)
    
    # Solve for affine transform: A * src_aug.T ≈ dst.T
    A, _, _, _ = np.linalg.lstsq(src_aug, dst, rcond=None)  # A: (3, 2)

    return A.T  # (2, 3)

@dataclass
class CalibConfig:
    max_points: int = 100
    click_ttl: float = 60

@dataclass
class KalmanFilterConfig:
    enabled: bool = True
    dt: float = 0.1
    process_noise: float = 1e-5
    measurement_noise: float = 1e-2

@dataclass
class WebEyeTrackConfig():
    blazegaze_mlp_fp: Union[str, pathlib.Path] = BLAZEGAZE_PATH
    ear_threshold: float = 0.2
    mediapipe_flm_model_fp: Union[str, pathlib.Path] = FACE_LANDMARKER_PATH
    screen_px_dimensions: Tuple[int, int] = (1920, 1080)
    screen_cm_dimensions: Tuple[float, float] = (53.1, 29.8)
    verbose: bool = False
    affine_matrix: Optional[np.ndarray] = None
    kalman_config: KalmanFilterConfig = field(default_factory=lambda: KalmanFilterConfig())
    calib_config: CalibConfig = field(default_factory=lambda: CalibConfig())

class WebEyeTrack():

    config: WebEyeTrackConfig

    def __init__(self, config: Optional[WebEyeTrackConfig] = None):
        if config is None:
            config = WebEyeTrackConfig()
        self.config = config

        # Setup MediaPipe Face Facial Landmark model
        base_options = python.BaseOptions(model_asset_path=config.mediapipe_flm_model_fp)
        options = vision.FaceLandmarkerOptions(base_options=base_options,
                                            output_face_blendshapes=True,
                                            output_facial_transformation_matrixes=True,
                                            num_faces=1)
        self.face_landmarker = vision.FaceLandmarker.create_from_options(options)

        # Load the BlazeGaze model
        model_config = BlazeGazeConfig(
            weights_fp=self.config.blazegaze_mlp_fp
        )
        self.blazegaze = BlazeGaze(model_config)

        # Create Kalman filter
        self.kalman_filter = KalmanFilter2D(
            dt=self.config.kalman_config.dt, 
            process_noise=self.config.kalman_config.process_noise, 
            measurement_noise=self.config.kalman_config.measurement_noise
        )

        # Keep track of the face width cm estimate
        self.face_width_cm = None
        self.intrinsics = None
        self.affine_matrix = None

        # Keep track of calibration data
        self.calib_data = {
            'support_x': [],
            'support_y': [],
            'timestamps': [],
            'pt_type': []
        }

    def prune_calib_data(self):
        # Prune the calibration data to keep only the last 100 points
        max_points = self.config.calib_config.max_points
        if len(self.calib_data['support_x']) > max_points:
            self.calib_data['support_x'] = self.calib_data['support_x'][-max_points:]
            self.calib_data['support_y'] = self.calib_data['support_y'][-max_points:]
            self.calib_data['timestamps'] = self.calib_data['timestamps'][-max_points:]
            self.calib_data['pt_type'] = self.calib_data['pt_type'][-max_points:]

        # Apply time-to-live pruning for 'click' points
        current_time = time.time()
        ttl = self.config.calib_config.click_ttl
        for i in self.calib_data['timestamps']:
            if current_time - i > ttl and self.calib_data['pt_type'][i] == 'click':
                index = self.calib_data['timestamps'].index(i)
                self.calib_data['support_x'].pop(index)
                self.calib_data['support_y'].pop(index)
                self.calib_data['timestamps'].pop(index)
                self.calib_data['pt_type'].pop(index)

    def compute_face_origin_3d(self, image_np: np.ndarray, face_landmarks_all: np.ndarray, face_landmarks_rt: np.ndarray):

        # Get image shape
        height, width, _ = image_np.shape

        # Estimate the face width
        if self.face_width_cm is None:
            self.face_width_cm = estimate_face_width(face_landmarks_all[:, :2], face_landmarks_rt)
        if self.intrinsics is None:
            # Use the first frame to estimate the intrinsics
            self.intrinsics = estimate_camera_intrinsics(np.zeros((height, width, 3)))

        facial_landmarks_px = face_landmarks_all[:, :2] * np.array([width, height])

        perspective_matrix = create_perspective_matrix(aspect_ratio=image_np.shape[1] / image_np.shape[0])
        inv_perspective_matrix = np.linalg.inv(perspective_matrix)

        # Perform 3D face reconstruction and determine the pose in 3D centimeters
        metric_transform, metric_face = face_reconstruction(
            perspective_matrix=perspective_matrix,
            face_landmarks=face_landmarks_all[:, :3],
            face_width_cm=self.face_width_cm,
            face_rt=face_landmarks_rt,
            K=self.intrinsics,
            frame_height=height,
            frame_width=width,
            frame=image_np
        )

        # Obtain the gaze origins based on the metric face pts
        gaze_origins = estimate_gaze_origins(
            face_landmarks_3d=metric_face,
            face_landmarks=facial_landmarks_px,
        )

        return gaze_origins['face_origin_3d']
    
    def detect_facial_landmarks(self, frame: np.ndarray) -> Tuple[bool, Tuple[Optional[np.ndarray], Optional[np.ndarray], Any]]:
        # Detect the landmarks
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame.astype(np.uint8))
        detection_results = self.face_landmarker.detect(mp_image)

        # Compute the face bounding box based on the MediaPipe landmarks
        try:
            face_landmarks_proto = detection_results.face_landmarks[0]
        except:
            return False, (None, None, detection_results)
        
        # Extract information fro the results
        face_landmarks = np.array([[lm.x, lm.y, lm.z, lm.visibility, lm.presence] for lm in face_landmarks_proto])
        face_rt = detection_results.facial_transformation_matrixes[0]
        return True, (face_landmarks, face_rt, detection_results)

    def prepare_input(self, image: np.ndarray, facial_landmarks: np.ndarray, facial_rt: np.ndarray):
        
        # Perform preprocessing to obtain the eye patch
        face_landmarks_2d = facial_landmarks[:, :2]
        face_landmarks_2d = face_landmarks_2d * np.array([image.shape[1], image.shape[0]])
        eye_patch = obtain_eyepatch(
            image, 
            face_landmarks_2d,
        )
        face_origin_3d = self.compute_face_origin_3d(
            image,
            facial_landmarks,
            facial_rt
        )

        return [
            eye_patch,
            get_head_vector(facial_rt),
            face_origin_3d
        ]

    # Wrap in @tf.function
    @tf.function
    def infer_fn(self, **kwargs):
        return self.blazegaze.model(kwargs)

    def adapt(self, 
            eye_patches: list, 
            head_vectors: list,
            face_origin_3ds: list,
            pog_norms: np.ndarray,
            steps_inner:int=5, 
            inner_lr:float=1e-5,
            affine_transform:bool=False,
            pt_type:Literal['calib','click']='calib' # Literal['calib', 'click']
        ):
        """
        Performs MAML-style adaptation on the gaze head using support samples.
        
        Args:
            eye_patches (list): List of eye patches.
            head_vectors (list): List of head vectors.
            face_origin_3ds (list): List of face origin 3D vectors.
            steps_inner (int): Number of inner-loop adaptation steps.
            inner_lr (float): Inner-loop learning rate.
        """
        # Prune old calib data
        self.prune_calib_data()

        opt = tf.keras.optimizers.Adam(
            learning_rate=inner_lr,
            # beta_1=0.9, beta_2=0.999, epsilon=1e-8
            beta_1=0.85, beta_2=0.9, epsilon=1e-8
        )

        encoder_model = self.blazegaze.encoder
        gaze_mlp = self.blazegaze.gaze_mlp
        support_x, support_y, _, _ = generate_support_and_query_samples(
            eye_patches=eye_patches,
            head_vectors=head_vectors,
            face_origin_3ds=face_origin_3ds,
            pog_norms=pog_norms,
            screen_cm_dimensions=self.config.screen_cm_dimensions,
            split_ratio=1
        )

        # Make a copy of the support_x and support_y
        single_support_x = {k: tf.identity(v) for k, v in support_x.items()}
        single_support_y = tf.identity(support_y)

        # Extend support_x and support_y with prior calibration data
        if len(self.calib_data['support_x']) > 0:
            for k, v in support_x.items():
                print(f"Extending support_x[{k}] with prior calibration data")
                prior_v = list_to_concat_tensor([x[k] for x in self.calib_data['support_x']], dtype=tf.float32, dim=0)
                support_x[k] = tf.concat(
                    [v, prior_v], axis=0
                )
            prior_v = list_to_concat_tensor(self.calib_data['support_y'], dtype=tf.float32, dim=0)
            support_y = tf.concat(
                [support_y, prior_v], axis=0
            )

        # Encode features (encoder is frozen)
        support_x['encoder_features'] = encoder_model(support_x['image'], training=False)
        features = ['encoder_features', 'head_vector', 'face_origin_3d']
        input_list = [support_x[feature] for feature in features]

        # Perform a single forward pass to compute an affine transformation
        if affine_transform and len(support_y) > 3:
            support_preds = gaze_mlp(input_list, training=False)
            self.affine_matrix = compute_affine_transform(
                src=support_preds.numpy(),
                dst=support_y.numpy()
            )
            self.affine_matrix_tf = tf.convert_to_tensor(self.affine_matrix, dtype=tf.float32)

            if self.config.verbose:
                print(f"Computed affine matrix:\n{self.affine_matrix}")

        # Adapt on support set
        for i in range(steps_inner):
            with tf.GradientTape() as tape:
                support_preds = gaze_mlp(input_list, training=True)

                # Apply affine transformation if available
                if affine_transform and self.affine_matrix is not None:
                    # Apply the affine transformation to the predictions
                    ones  = tf.ones_like(support_preds[:, :1])          # [B,1]
                    homog = tf.concat([support_preds, ones], axis=1)    # [B,3]
                    affine_t = tf.transpose(self.affine_matrix_tf)      # [3,2]
                    support_preds = tf.matmul(homog, affine_t)  
                    support_preds = support_preds[:, :2]

                support_loss = mae_cm_loss(support_y, support_preds, support_x['screen_info'])
                if self.config.verbose:
                    print(f"Support loss ({i}), inner_lr={inner_lr}: {support_loss.numpy():.4f}")

            # grads = tape.gradient(support_loss, gaze_mlp.trainable_weights)
            grads = tape.gradient(support_loss, gaze_mlp.trainable_variables)
            opt.apply_gradients(zip(grads, gaze_mlp.trainable_variables))

        # Store the calibration data
        self.calib_data['support_x'].append(single_support_x)
        self.calib_data['support_y'].append(single_support_y.numpy()) 
        self.calib_data['timestamps'].append(time.time())
        self.calib_data['pt_type'].append(pt_type)

        print(f"Calibration data size: {len(self.calib_data['support_x'])}")

        # For debugging purposes, print out the 

        if self.config.verbose:
            print(f"Adaptation completed. Support loss: {support_loss.numpy():.4f}")
        return support_preds.numpy()

    def adapt_from_frames(
            self, 
            frames: list, 
            norm_pogs: np.ndarray, 
            steps_inner=5, 
            inner_lr=1e-5, 
            affine_transform=False,
            pt_type:Literal['calib_dot','click']='calib_dot' # Literal['calib', 'click']
        ):
        
        # For each frame, obtain the eye patch and head vector
        eye_patches = []
        head_vectors = []
        face_origin_3ds = []
        valid_norm_pogs = []
        for i, frame in enumerate(frames):
            status, (face_landmarks, face_rt, detection_results) = self.detect_facial_landmarks(frame)
            if not status:
                print("Failed to detect facial landmarks")
                continue

            # Perform preprocessing to obtain the eye patch
            data = self.prepare_input(
                frame,
                face_landmarks,
                face_rt
            )
            eye_patches.append(data[0])
            head_vectors.append(data[1])
            face_origin_3ds.append(data[2])
            valid_norm_pogs.append(norm_pogs[i])

        # Perform the adaptation
        return self.adapt(
            eye_patches=eye_patches,
            head_vectors=head_vectors,
            face_origin_3ds=face_origin_3ds,
            pog_norms=valid_norm_pogs,
            steps_inner=steps_inner,
            inner_lr=inner_lr,
            affine_transform=affine_transform,
            pt_type=pt_type
        )
    
    def adapt_from_gaze_results(
            self,
            gaze_results: List[GazeResult],
            norm_pogs: np.ndarray, 
            steps_inner=5,
            inner_lr=1e-5,
            affine_transform=False,
            pt_type:Literal['calib','click']='calib' # Literal['calib', 'click']
        ):
        
        # For each frame, obtain the eye patch and head vector
        eye_patches = []
        head_vectors = []
        face_origin_3ds = []
        valid_norm_pogs = []
        for i, gaze_result in enumerate(gaze_results):
            # Perform preprocessing to obtain the eye patch
            eye_patches.append(gaze_result.eye_patch)
            head_vectors.append(gaze_result.head_vector)
            face_origin_3ds.append(gaze_result.face_origin_3d)
            valid_norm_pogs.append(norm_pogs[i])

        # Perform the adaptation
        return self.adapt(
            eye_patches=eye_patches,
            head_vectors=head_vectors,
            face_origin_3ds=face_origin_3ds,
            pog_norms=valid_norm_pogs,
            steps_inner=steps_inner,
            inner_lr=inner_lr,
            affine_transform=affine_transform,
            pt_type=pt_type
        )

    def adapt_from_samples(
            self, 
            samples, 
            steps_inner=5, 
            inner_lr=1e-5, 
            affine_transform=False,
            pt_type:Literal['calib','click']='calib' # Literal['calib', 'click']
        ):
        """
        Performs MAML-style adaptation on the gaze head using support samples.
        
        Args:
            samples (dict): Dictionary with support input features and labels.
            steps_inner (int): Number of inner-loop adaptation steps.
            inner_lr (float): Inner-loop learning rate.
        """
        eye_patches = []
        head_vectors = []
        face_origin_3ds = []
        valid_norm_pogs = []
        for sample in samples:
            data = self.prepare_input(
                sample['image'],
                sample['facial_landmarks'],
                sample['facial_rt']
            )
            # Store
            eye_patches.append(data[0])
            head_vectors.append(data[1])
            face_origin_3ds.append(data[2])
            valid_norm_pogs.append(sample['pog_norm'])

        # Perform the adaptation
        return self.adapt(
            eye_patches=eye_patches,
            head_vectors=head_vectors,
            face_origin_3ds=face_origin_3ds,
            pog_norms=valid_norm_pogs,
            steps_inner=steps_inner,
            inner_lr=inner_lr,
            affine_transform=affine_transform,
            pt_type=pt_type
        )

    def step(
            self,
            frame: np.ndarray,
            face_landmarks: np.ndarray,
            face_rt: np.ndarray,
            durations: Optional[dict] = None
        ):
        if durations is None:
            durations = {}
        tic = time.perf_counter()

        # Extract the 2D coordinates of the face landmarks
        face_landmarks_2d = face_landmarks[:, :2]
        face_landmarks_2d = face_landmarks_2d * np.array([frame.shape[1], frame.shape[0]])
        
        # Perform preprocessing to obtain the eye patch
        try:
            eye_patch, head_vector, face_origin_3d = self.prepare_input(
                frame,
                face_landmarks,
                face_rt
            )
        except Exception as e:
            print(f"Error in obtaining eye patch: {e}")
            return TrackingStatus.FAILED, None
        toc = time.perf_counter()

        durations['prepare_input'] = toc - tic

        if self.config.verbose:
            cv2.imshow('Eye Patch', eye_patch)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                cv2.destroyAllWindows()

        # Check if the gaze_state is open or closed via EAR threshold
        if (compute_ear(facial_landmarks=face_landmarks_2d, side='left') < self.config.ear_threshold) or \
            (compute_ear(facial_landmarks=face_landmarks_2d, side='right') < self.config.ear_threshold):
            gaze_state = 'closed'
        else:
            gaze_state = 'open'

        # If 'closed' return (0, 0) as the PoG
        if gaze_state == 'closed':
            durations['infer_pog'] = 0.0
            durations['affine_&_kalman'] = 0.0
            durations['total'] = np.sum(list(durations.values()))
            return TrackingStatus.SUCCESS, GazeResult(
                facial_landmarks=face_landmarks,
                face_rt=face_rt,
                face_blendshapes=None,
                eye_patch=eye_patch,
                head_vector=head_vector,
                face_origin_3d=face_origin_3d,
                metric_face=None,
                metric_transform=None,
                gaze_state=gaze_state,
                norm_pog=np.array([0, 0]),
                durations=durations
            )

        # Perform the gaze estimation via BlazeGaze Model
        pog_estimation = self.infer_fn(
            image=tf.convert_to_tensor(np.expand_dims(eye_patch/255.0, axis=0), dtype=tf.float32),
            head_vector=tf.convert_to_tensor(np.expand_dims(head_vector, axis=0), dtype=tf.float32),
            face_origin_3d=tf.convert_to_tensor(np.expand_dims(face_origin_3d, axis=0), dtype=tf.float32)
        )
        toc2 = time.perf_counter()
        durations['infer_pog'] = toc2 - toc

        # Apply affine transformation if available
        if self.affine_matrix is not None:
            augmented_pog = np.append(pog_estimation[0], 1.0)  # shape (3,)
            norm_pog = self.affine_matrix @ augmented_pog       # shape (2,)
            # norm_pog = pog_estimation[0] 
        else:
            norm_pog = pog_estimation[0].numpy()
        norm_pog = np.array([float(norm_pog[0]), float(norm_pog[1])])

        # Apply Kalman filter to the gaze result
        if self.config.kalman_config.enabled:
            norm_pog = self.kalman_filter.step(norm_pog).flatten()

        toc = time.perf_counter()
        durations['affine_&_kalman'] = toc - toc2
        durations['total'] = np.sum(list(durations.values()))

        # return True, pog_estimation[0]
        return TrackingStatus.SUCCESS, GazeResult(
            facial_landmarks=face_landmarks,
            face_rt=face_rt,
            face_blendshapes=None,
            eye_patch=eye_patch,
            head_vector=head_vector,
            face_origin_3d=face_origin_3d,
            metric_face=None,
            metric_transform=None,
            gaze_state=gaze_state,
            norm_pog=norm_pog,
            durations=durations
        )

    def process_frame(
            self,
            frame: np.ndarray
    ) -> Tuple[TrackingStatus, Optional[GazeResult], Any]:
        durations = {}
        tic = time.perf_counter()

        # Detect the facial landmarks
        tracking_status, (face_landmarks, face_rt, detection_results) = self.detect_facial_landmarks(frame)
        if not tracking_status:
            return TrackingStatus.FAILED, None, detection_results
        toc = time.perf_counter()
        durations['landmark_detection'] = toc - tic
        
        # Perform step
        tracking_status, gaze_result = self.step(
            frame,
            face_landmarks,
            face_rt,
            durations=durations
        )
        
        return tracking_status, gaze_result, detection_results