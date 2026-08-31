from typing import Any, Dict, Tuple, Optional, Literal
from dataclasses import dataclass, field
from enum import Enum
import numpy as np
import pathlib
import mediapipe.python as mp

@dataclass
class Annotations:

    # Original frame information
    original_img_size: np.ndarray # (3,)
    intrinsics: np.ndarray # (3, 3)

    # Facial Landmarks information
    facial_detection_results: Any
    facial_landmarks: np.ndarray # (5, N)
    facial_landmarks_2d: np.ndarray # (2, N)
    facial_rt: np.ndarray # (4, 4)
    face_blendshapes: np.ndarray # (N,)
    face_bbox: np.ndarray # (4,)
    head_pose_3d: np.ndarray # (6,), rotation matrix

    # Face Gaze
    face_origin_3d: np.ndarray # (3,)
    face_origin_2d: np.ndarray # (2,)
    face_gaze_vector: np.ndarray # (3,)

    # Eye Gaze
    left_eye_origin_3d: np.ndarray
    right_eye_origin_3d: np.ndarray
    left_eye_origin_2d: np.ndarray
    right_eye_origin_2d: np.ndarray
    left_gaze_vector: np.ndarray
    right_gaze_vector: np.ndarray

    # Target information
    gaze_target_3d: np.ndarray # (3,)
    gaze_target_2d: np.ndarray # (2,)
    pog_px: np.ndarray # (2,)
    pog_norm: np.ndarray # (2,)
    pog_cm: np.ndarray # (2,)

    # Gaze State Information
    is_closed: np.ndarray # (1,)

@dataclass
class CalibrationData:
    camera_matrix: np.ndarray
    dist_coeffs: np.ndarray
    camera_retval: float
    screen_RT: np.ndarray
    monitor_height_cm: float
    monitor_height_px: int
    monitor_width_cm: float
    monitor_width_px: int

@dataclass
class Sample:
    id: str
    participant_id: str
    image_fp: pathlib.Path
    annotation_fp: pathlib.Path

@dataclass
class PoGResult:
    pog_cm_c: np.ndarray # X, Y, Z in Camera Coordinate System
    pog_cm_s: np.ndarray # X, Y, Z in Screen Coordinate System
    pog_norm: np.ndarray # Normalized uv coordinates in Screen Plane
    pog_px: np.ndarray # Quantized norm to match screen pixel resolution

@dataclass
class EyeResult:
    is_closed: bool
    origin: np.ndarray # X, Y, Z
    origin_2d: np.ndarray # u, v
    direction: np.ndarray # X, Y, Z
    pog: Optional[PoGResult] = None
    meta_data: Dict[str, Any] = field(default_factory=dict)

# @dataclass
# class GazeResult:
#     # Inputs
#     facial_landmarks: np.ndarray # [N, 5]
#     face_rt: np.ndarray # [4, 4]
#     face_blendshapes: np.ndarray # [N, 1]

#     # Face Reconstruction
#     metric_face: np.ndarray # [N, 486]
#     metric_transform: np.ndarray # [4, 4]

#     # Face Gaze
#     face_origin: np.ndarray # X, Y, Z
#     face_origin_2d: np.ndarray # X, Y
#     face_gaze: np.ndarray # X, Y, Z

#     # Per eye results
#     left: EyeResult
#     right: EyeResult

#     # Meta data
#     duration: float # seconds
#     eyeball_radius: float
#     eyeball_centers: Tuple[np.ndarray, np.ndarray]
#     perspective_matrix: np.ndarray

#     # PoG
#     pog: Optional[PoGResult] = None

@dataclass
class GazeResult:
    
    # Inputs
    facial_landmarks: np.ndarray # [N, 5]
    face_rt: np.ndarray # [4, 4]
    face_blendshapes: np.ndarray # [N, 1]

    # Preprocessing
    eye_patch: np.ndarray # [H, W, 3] - RGB image of the eye region
    head_vector: np.ndarray # [3,] - Head vector in camera coordinates
    face_origin_3d: np.ndarray # X, Y, Z

    # Face Reconstruction
    metric_face: np.ndarray # [N, 486]
    metric_transform: np.ndarray # [4, 4]

    # Gaze state (blinking)
    gaze_state: Literal['open', 'closed'] = 'open'

    # PoG (normalized screen coordinates)
    norm_pog: np.ndarray = field(default_factory=lambda: np.array([0.5, 0.5]))

    # Meta data
    durations: dict[str, float] = field(default_factory=dict) # seconds

class TrackingStatus(Enum):
    FAILED = 0
    SUCCESS = 1
