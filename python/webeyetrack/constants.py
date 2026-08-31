import pathlib
import numpy as np

# Resolve paths relative to the installed package directory (not GIT_ROOT) so it works in wheels. importlib.resources might be a better option.
PACKAGE_DIR = pathlib.Path(__file__).parent
DEFAULT_CONFIG = PACKAGE_DIR / 'default_config.yaml'
MODEL_WEIGHTS = PACKAGE_DIR / 'model_weights'
FACE_LANDMARKER_PATH = MODEL_WEIGHTS / 'face_landmarker_v2_with_blendshapes.task'
BLAZEGAZE_PATH = MODEL_WEIGHTS / 'blazegaze_mpiifacegaze.keras'

LEFT_EYE_LANDMARKS = [263, 362, 386, 374, 380]
RIGHT_EYE_LANDMARKS = [33, 133, 159, 145, 153]
LEFT_BLENDSHAPES = [14, 16, 18, 12]
RIGHT_BLENDSHAPES = [13, 15, 17, 11]
REAL_WORLD_IPD_CM = 6.3 # Inter-pupilary distance (cm)
HFOV = 100
VFOV = 90

# Landmark reference:
# https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png

# Format [leftmost, rightmost, topmost, bottommost]
LEFT_EYEAREA_LANDMARKS = [463, 359, 257, 253]
RIGHT_EYEAREA_LANDMARKS = [130, 243, 27, 23]
LEFT_EYEAREA_TOTAL_LANDMARKS = [463,  341, 256, 252, 253, 254, 339, 255, 359, 467, 260, 259, 257, 258, 286, 414]
RIGHT_EYEAREA_TOTAL_LANDMARKS = [130, 25,  110, 24,  23,  22,  26,  112, 243, 190, 56,  28,  27,  29,  30,  247]
LEFT_EYE_HORIZONTAL_LANDMARKS = [362, 263]
RIGHT_EYE_HORIZONTAL_LANDMARKS = [33, 133]

# Format [leftmost, rightmost, topmost, bottommost]
LEFT_EYELID_LANDMARKS = [362, 263, 386, 374]
RIGHT_EYELID_LANDMARKS = [33, 133, 159, 145]
LEFT_EYELID_TOTAL_LANDMARKS = [ 362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
RIGHT_EYELID_TOTAL_LANDMARKS = [33,  7,   163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]

# EAR landmarks (for detecting eye blinking) # p1, p2, p3, p4, p5, p6
LEFT_EYE_EAR_LANDMARKS = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_EAR_LANDMARKS = [133, 158, 160, 33, 144, 153]

RIGHT_IRIS_LANDMARKS = [468, 470, 469, 472, 471] # center, top, right, bottom, left
LEFT_IRIS_LANDMARKS = [473, 475, 474, 477, 476] # center, top, right, bottom, left
IRIS_LANDMARKS = RIGHT_IRIS_LANDMARKS + LEFT_IRIS_LANDMARKS 
AVERAGE_IRIS_SIZE_CM = 1.2

# EYE_PADDING_HEIGHT = 0.1
EYE_PADDING_WIDTH = 0.3
EYE_HEIGHT_RATIO = 0.7

# Used to determine the width of the face
LEFTMOST_LANDMARK = 356
RIGHTMOST_LANDMARK = 127
TOPMOST_LANDMARK = 10
BOTTOMMOST_LANDMARK = 152

# Position of eyeball center based on canonical coordinate system
# LEFT_EYEBALL_CENTER = np.array([3.0278, -2.7526, 2.7234]) * 10 # X, Y, Z
# RIGHT_EYEBALL_CENTER = np.array([-3.0278, -2.7526, 2.7234]) * 10 # X, Y, Z

# Average radius of an eyeball in cm
EYEBALL_RADIUS = 1.2
EYEBALL_X, EYEBALL_Y, EYEBALL_Z = 3, 2.8, 3
EYEBALL_DEFAULT = (np.array([-EYEBALL_X, -EYEBALL_Y, -EYEBALL_Z]), np.array([EYEBALL_X, -EYEBALL_Y, -EYEBALL_Z])) # left, right

# According to https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/graphs/face_effect/face_effect_gpu.pbtxt#L61-L65
VERTICAL_FOV_DEGREES = 60
NEAR = 1.0 # 1cm
FAR = 10000 # 100m 
ORIGIN_POINT_LOCATION = 'BOTTOM_LEFT_CORNER'

# EAR threshold
EAR_THRESHOLD = 0.2