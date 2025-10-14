"""
References
https://github.com/swook/faze_preprocess/blob/master/create_hdf_files_for_faze.py
"""
import os
import pathlib
from typing import List, Dict, Union, Optional, Tuple
import shutil
import json
from dataclasses import asdict
import pickle
from collections import defaultdict

import pandas as pd
from tqdm import tqdm
import cv2
from PIL import Image
import yaml
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from webeyetrack.model_based import (
    estimate_face_width, 
    face_reconstruction,
    create_perspective_matrix,
    estimate_camera_intrinsics,
    estimate_gaze_origins,
    create_transformation_matrix
)
from webeyetrack.constants import GIT_ROOT, FACE_LANDMARKER_PATH
from webeyetrack.data_protocols import Annotations, CalibrationData, Sample

from utils import data_normalization_entry

CWD = pathlib.Path(__file__).parent
LEFT_EYE_LANDMARKS = [263, 362, 386, 374, 380]
RIGHT_EYE_LANDMARKS = [33, 133, 159, 145, 153]

# Load the GazeCapture participant IDs
with open(CWD.parent / 'GazeCapture_participant_ids.json', 'r') as f:
    GAZE_CAPTURE_IDS = json.load(f)

# References
# https://github.com/CSAILVision/GazeCapture/blob/master/code/cam2screen.m
# https://github.com/CSAILVision/GazeCapture/tree/master?tab=readme-ov-file#dotinfojson

def cam2screen_single(x_cam_cm, y_cam_cm, device_name, apple_device_df):
    """
    Convert camera-space (cm) to screen-space (cm) for a single device and orientation == 1.

    Args:
        x_cam_cm (float): X coordinate in camera space (cm).
        y_cam_cm (float): Y coordinate in camera space (cm).
        device_name (str): Name of the Apple device (e.g., 'iPhone 6s').
        apple_device_df (pd.DataFrame): Loaded Apple device specs.

    Returns:
        (x_screen_cm, y_screen_cm): Tuple of converted screen-space coordinates in cm.
    """
    row = apple_device_df[apple_device_df['DeviceName'] == device_name]
    if row.empty:
        raise ValueError(f"Device '{device_name}' not found in device spec.")

    row = row.iloc[0]
    dX = row['DeviceCameraToScreenXMm']
    dY = row['DeviceCameraToScreenYMm']

    # Convert input from cm to mm
    x_cam_mm = x_cam_cm * 10
    y_cam_mm = y_cam_cm * 10

    # Orientation == 1 (portrait)
    x_screen_mm = x_cam_mm + dX
    y_screen_mm = -y_cam_mm - dY

    # Convert back to cm
    x_screen_cm = x_screen_mm / 10.0
    y_screen_cm = y_screen_mm / 10.0

    return x_screen_cm, y_screen_cm

class GazeCaptureDataset():

    def __init__(
        self,
        dataset_dir: Union[str, pathlib.Path],
        face_size: Tuple[int, int] = None,
        img_size: Tuple[int, int] = None,
        dataset_size: Optional[int] = None,
        per_participant_size: Optional[int] = None,
        participants: Optional[List[str]] = None
    ):
        
        # Process input variables
        if isinstance(dataset_dir, str):
            dataset_dir = pathlib.Path(dataset_dir)
        assert dataset_dir.is_dir(), f"Dataset directory {dataset_dir} does not exist."
        
        self.dataset_dir = dataset_dir
        self.dataset_size = dataset_size
        self.per_participant_size = per_participant_size
        self.face_size = face_size
        self.img_size = img_size
        self.participants = participants
        self.face_landmarker = None

        self.apple_devices = pd.read_csv(CWD / "apple_device_data.csv")
        self.apple_devices['DeviceName'] = self.apple_devices['DeviceName'].str.lower()
        self.preprocessing()

    def load_model(self):

        # Setup MediaPipe Face Facial Landmark model
        base_options = python.BaseOptions(model_asset_path=str(FACE_LANDMARKER_PATH))
        options = vision.FaceLandmarkerOptions(base_options=base_options,
                                            output_face_blendshapes=True,
                                            output_facial_transformation_matrixes=True,
                                            num_faces=1)
        self.face_landmarker = vision.FaceLandmarker.create_from_options(options)

    def preprocessing(self):

        gz_elements = [x for x in self.dataset_dir.iterdir() if x.suffix == '.gz']
        for gz_element in tqdm(gz_elements, total=len(gz_elements)):
            # If element is a .tar.gz file, extract it
            if gz_element.suffix == '.gz':
                shutil.unpack_archive(gz_element, extract_dir=self.dataset_dir)
                gz_element.unlink()

        # Now obtain each participants folder
        if self.participants is not None:
            participant_dir = [self.dataset_dir / x for x in self.participants]
        else:
            participant_dir = [x for x in self.dataset_dir.iterdir() if x.is_dir()]

        # Saving information
        # self.samples: List[Sample] = []
        self.samples = defaultdict(list)
        self.sample_calibration_data: List[CalibrationData] = []
        # self.participant_calibration_data: Dict[CalibrationData] = {}

        # Open the ``frames.json`` file with a list of frame names
        num_samples = 0
        for part_dir in tqdm(participant_dir, total=len(participant_dir)):

            if self.dataset_size is not None and num_samples >= self.dataset_size:
                break

            participant_id = part_dir.name
            frames_json = part_dir / 'frames.json'
            with open(frames_json, 'r') as f:
                frames_fname_list = json.load(f)
            with open(part_dir / 'dotInfo.json', 'r') as f:
                dot_info = json.load(f)
            dot_info_df = pd.DataFrame(dot_info)
            with open(part_dir / 'screen.json', 'r') as f:
                screen_info = json.load(f)
            screen_info_df = pd.DataFrame(screen_info)
            with open(part_dir / 'info.json', 'r') as f:
                device_info = json.load(f)
            """
            {
                "TotalFrames": 99,
                "NumFaceDetections": 97,
                "NumEyeDetections": 56,
                "Dataset": "train",
                "DeviceName": "iPhone 6"
            }
            """
            device_name = device_info['DeviceName'].lower()
            device_meta = self.apple_devices[self.apple_devices['DeviceName'] == device_name]
            assert len(device_meta) == 1, f"Device {device_name} not found in device specs."

            per_participant_samples = 0
            face_width_cm = None
            intrinsics = None
            height, width = None, None

            # Create a directory for the generated samples
            os.makedirs(part_dir / 'samples', exist_ok=True)

            for i, frame in tqdm(enumerate(frames_fname_list), total=len(frames_fname_list)):

                if self.dataset_size is not None and num_samples >= self.dataset_size:
                    break

                if self.per_participant_size is not None and per_participant_samples >= self.per_participant_size:
                    break

                frame_fp = part_dir / 'frames' / frame
                dot_info = dot_info_df.iloc[i]
                """
                DotNum      0.000000
                XPts      280.000000
                YPts      528.000000
                XCam        1.938750
                YCam       -9.467451
                Time        0.237868
                Name: 0, dtype: float64
                """
                screen_info = screen_info_df.iloc[i]
                """
                H              568
                W              320
                Orientation      1
                Name: 0, dtype: int64
                """

                # Compute the location of the camera with respect to the screen
                # This needs to consider the orientation of the screen
                # Assume the camera is at the top center of the screen (in portrait mode)
                # Compute the PoG
                pog_px = np.array([dot_info['XPts'], dot_info['YPts']])
                pog_cm_cam = np.array([dot_info['XCam'], dot_info['YCam']]) # Camera Coordinate Space
                s_width, s_height = screen_info['W'], screen_info['H']
                pog_norm = np.array([pog_px[0] / s_width, pog_px[1] / s_height])
                s_height_cm, s_width_cm = device_meta['DeviceScreenHeightMm'].values[0] / 10, device_meta['DeviceScreenWidthMm'].values[0] / 10

                # Convert the camera space to screen space
                pog_cm = cam2screen_single(
                    x_cam_cm=dot_info['XCam'],
                    y_cam_cm=dot_info['YCam'],
                    device_name=device_name,
                    apple_device_df=self.apple_devices
                )

                """
                Orientation: The orientation of the interface, as described by the enumeration UIInterfaceOrientation, where:
                1: portrait
                2: portrait, upside down (iPad only)
                3: landscape, with home button on the right
                4: landscape, with home button on the left
                """
                # Only consider the portrait mode for now - as this is the most common and matches phones, tablets and PCs
                if screen_info['Orientation'] == 1:
                    camera_location = np.array([s_width_cm/2, 0, 0])
                elif screen_info['Orientation'] == 2:
                    continue
                    # camera_location = np.array([s_width_cm/2, s_height_cm, 0])
                elif screen_info['Orientation'] == 3:
                    continue
                    # camera_location = np.array([0, s_width_cm/2, 0])
                elif screen_info['Orientation'] == 4:
                    continue
                    # camera_location = np.array([s_height_cm, s_width_cm/2, 0])
                else:
                    raise ValueError(f"Orientation {screen_info['Orientation']} is not recognized.")

                # print(f"pog_cm: {pog_cm}, pog_cm_cam: {pog_cm_cam}")

                screen_RT = create_transformation_matrix(
                    scale=np.array([1, 1, 1]),
                    translation=camera_location,
                    rotation=np.array([0, 0, 0])
                )

                # Create calibration data
                calibration_data = CalibrationData(
                    camera_retval=0,
                    camera_matrix=intrinsics,
                    dist_coeffs=np.zeros((5, 1)),
                    screen_RT=screen_RT,
                    monitor_height_cm=s_height_cm,
                    monitor_height_px=s_height,
                    monitor_width_cm=s_width_cm,
                    monitor_width_px=s_width
                )

                # If the annotation already exists, create the sample that is referenced
                annotation_fp = part_dir / 'samples' / f'{frame}.pkl'
                meta_fp = part_dir / 'samples' / f'meta.json'
                if annotation_fp.exists():
                # if False:
                    self.samples['id'].append(f"{participant_id}_{i}")
                    self.samples['participant_id'].append(participant_id)
                    self.samples['image_fp'].append(frame_fp)
                    self.samples['annotation_fp'].append(annotation_fp)
                    self.sample_calibration_data.append(calibration_data)
                    num_samples += 1
                    per_participant_samples += 1
                    continue

                # Load the meta
                if meta_fp.exists():
                    with open(meta_fp, 'r') as f:
                        meta = json.load(f)
                else:
                    meta = {}

                # If face detection is not successful, skip the frame
                if 'face_detected' in meta and not meta['face_detected']:
                    continue

                # Load the image
                image_np = cv2.imread(str(frame_fp))

                # Convert BGR->RGB
                image_np = cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB)

                if self.face_landmarker is None:
                    self.load_model()

                # Detect the facial landmarks via MediaPipe
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_np)
                detection_results = self.face_landmarker.detect(mp_image)
                i_h, i_w, _ = image_np.shape

                # Compute the face bounding box based on the MediaPipe landmarks
                try:
                    face_landmarks_proto = detection_results.face_landmarks[0]
                except:
                    print(f"Participant {participant_id} image at frame {i} does not have a face detected.")

                    # Make that this frame is not to be reconsidered via the meta.json file
                    meta['face_detected'] = False
                    with open(meta_fp, 'w') as f:
                        json.dump(meta, f)

                    continue

                # Save the detection results as numpy arrays
                face_landmarks_all = np.array([[lm.x, lm.y, lm.z, lm.visibility, lm.presence] for lm in face_landmarks_proto])
                face_landmarks_rt = detection_results.facial_transformation_matrixes[0]
                face_blendshapes = detection_results.face_blendshapes[0]
                face_landmarks = np.array([[lm.x * i_w, lm.y * i_h] for lm in face_landmarks_proto])
                
                # Draw the landmarks on the image
                # image_landmarks = draw_landmarks_on_image(image_np, detection_results)
                # cv2.imshow('image', image_landmarks)
                # cv2.waitKey(0)

                # Estimate the face width
                if face_width_cm is None:
                    face_width_cm = estimate_face_width(face_landmarks_all[:, :2], face_landmarks_rt)
                if intrinsics is None:
                    # Use the first frame to estimate the intrinsics
                    height, width, _ = image_np.shape
                    intrinsics = estimate_camera_intrinsics(np.zeros((height, width, 3)))

                facial_landmarks_px = face_landmarks_all[:, :2] * np.array([width, height])

                perspective_matrix = create_perspective_matrix(aspect_ratio=image_np.shape[1] / image_np.shape[0])
                inv_perspective_matrix = np.linalg.inv(perspective_matrix)

                # Perform 3D face reconstruction and determine the pose in 3D centimeters
                metric_transform, metric_face = face_reconstruction(
                    perspective_matrix=perspective_matrix,
                    face_landmarks=face_landmarks_all[:, :3],
                    face_width_cm=face_width_cm,
                    face_rt=face_landmarks_rt,
                    K=intrinsics,
                    frame_height=height,
                    frame_width=width,
                    frame=image_np
                )

                # Obtain the gaze origins based on the metric face pts
                gaze_origins = estimate_gaze_origins(
                    face_landmarks_3d=metric_face,
                    face_landmarks=facial_landmarks_px,
                )

                # Construct a 3D gaze target based on the dot information
                gaze_target_3d = np.array([dot_info['XCam'], dot_info['YCam'], 0])

                # Compute the gaze vector for each eye between origin and target
                face_gaze_vector = gaze_target_3d - gaze_origins['face_origin_3d']

                # Convert face_blendshapes to a proper numpy array
                np_face_blendshapes = np.array([x.score for x in face_blendshapes])

                annotation = Annotations(
                    original_img_size=np.array(image_np.shape),
                    intrinsics=intrinsics,
                    # Facial landmarks
                    facial_detection_results=detection_results,
                    facial_landmarks=face_landmarks_all,
                    facial_landmarks_2d=face_landmarks,
                    facial_rt=face_landmarks_rt,
                    face_blendshapes=np_face_blendshapes,
                    face_bbox=np.array([]), # Not important
                    head_pose_3d=np.array([]),
                    # Face Gaze
                    face_origin_3d=gaze_origins['face_origin_3d'],
                    face_origin_2d=gaze_origins['face_origin_2d'].flatten(),
                    face_gaze_vector=face_gaze_vector,
                    # Eye Gaze
                    left_eye_origin_3d=np.empty((3, 0), dtype=np.float32),
                    left_eye_origin_2d=np.empty((2, 0), dtype=np.float32),
                    left_gaze_vector=np.empty((3, 0), dtype=np.float32),
                    right_eye_origin_3d=np.empty((3, 0), dtype=np.float32),
                    right_eye_origin_2d=np.empty((2, 0), dtype=np.float32),
                    right_gaze_vector=np.empty((3, 0), dtype=np.float32),
                    # Target information
                    gaze_target_3d=gaze_target_3d,
                    gaze_target_2d=np.zeros((2, 0), dtype=np.float32),
                    pog_px=pog_px,
                    pog_norm=pog_norm,
                    pog_cm=pog_cm,
                    # Gaze State Information
                    is_closed=np.array([False])
                )

                # Save the annotation
                with open(annotation_fp, 'wb') as f:
                    pickle.dump(annotation, f)

                self.samples['id'].append(f"{participant_id}_{i}")
                self.samples['participant_id'].append(participant_id)
                self.samples['image_fp'].append(frame_fp)
                self.samples['annotation_fp'].append(annotation_fp)
                self.sample_calibration_data.append(calibration_data)
                num_samples += 1
                per_participant_samples += 1
        
        # Convert the samples to a DataFrame
        self.samples = pd.DataFrame(self.samples)

    def get_samples_meta_df(self):
        return self.samples

    def __getitem__(self, index: int):
        sample = self.samples.iloc[index]
        calibration_data = self.sample_calibration_data[index]

        # Load image
        image = Image.open(sample.image_fp)
        image_np = np.array(image)

        # Get the calibration
        # calibration_ffffdata = self.participant_calibration_data[sample.participant_id]

        # Load the annotations
        with open(sample.annotation_fp, 'rb') as f:
            annotations = pickle.load(f)

        item_dict = {
            'person_id': sample.participant_id,
            'image': image_np,
            'intrinsics': calibration_data.camera_matrix,
            'dist_coeffs': calibration_data.dist_coeffs,
            'screen_RT': calibration_data.screen_RT.astype(np.float32),
            'screen_height_cm': calibration_data.monitor_height_cm,
            'screen_height_px': calibration_data.monitor_height_px,
            'screen_width_cm': calibration_data.monitor_width_cm,
            'screen_width_px': calibration_data.monitor_width_px,
        }
        item_dict.update(asdict(annotations))
        return item_dict

    def __len__(self):
        return len(self.samples)
    
if __name__ == "__main__":
    
    from webeyetrack.constants import DEFAULT_CONFIG
    with open(DEFAULT_CONFIG, 'r') as f:
        config = yaml.safe_load(f)

    dataset = GazeCaptureDataset(
        dataset_dir=GIT_ROOT / pathlib.Path(config['datasets']['GazeCapture']['path']),
        per_participant_size=3,
        dataset_size=100
        # participants=GAZE_CAPTURE_IDS
    )
    print(len(dataset))

    sample = dataset[0]
    # print(json.dumps({k: str(v.dtype) for k, v in sample.items()}, indent=4))
    print(dataset.samples.head())
    print(sample.keys())

    for sample in dataset:
        sample['image'] = cv2.cvtColor(sample['image'], cv2.COLOR_BGR2RGB)
        data_normalization_entry(0, sample)
    # import pdb; pdb.set_trace()
    # cv2.imshow('image', sample['image'])
    # cv2.waitKey(1000)
    # cv2.destroyAllWindows()