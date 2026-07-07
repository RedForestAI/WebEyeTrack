from typing import Tuple, Dict
import numpy as np
import math
import cv2

from .constants import *
from .utilities import *
from .data_protocols import PoGResult

########################################################################################
# Blink Detection
########################################################################################

def compute_ear(facial_landmarks, side='left'):

    EYE_EAR_LANDMARKS = LEFT_EYE_EAR_LANDMARKS if side == 'left' else RIGHT_EYE_EAR_LANDMARKS
    p1 = facial_landmarks[EYE_EAR_LANDMARKS[0]]
    p2 = facial_landmarks[EYE_EAR_LANDMARKS[1]]
    p3 = facial_landmarks[EYE_EAR_LANDMARKS[2]]
    p4 = facial_landmarks[EYE_EAR_LANDMARKS[3]]
    p5 = facial_landmarks[EYE_EAR_LANDMARKS[4]]
    p6 = facial_landmarks[EYE_EAR_LANDMARKS[5]]

    ear = (np.linalg.norm(p2 - p6) + np.linalg.norm(p3 - p5)) / (2 * np.linalg.norm(p1 - p4))
    return ear

########################################################################################
# Preprocessing
########################################################################################

def obtain_eyepatch(
        frame: np.ndarray, 
        face_landmarks: np.ndarray,
        face_padding_coefs: Tuple[float, float] = [0.4, 0.2],
        face_crop_size: int = 512,
        dst_img_size: Tuple[int, int] = (512, 128)):
    
    # Compute the homography matrix (4 pts) from the points to a final flat rectangle
    lefttop = face_landmarks[103]
    leftbottom = face_landmarks[150]
    righttop = face_landmarks[332]
    rightbottom = face_landmarks[379]
    center = face_landmarks[4]

    src_pts = np.array([
        lefttop,
        leftbottom,
        rightbottom,
        righttop
    ], dtype=np.float32)

    # Add padding to the points, radially away from the center
    src_direction = src_pts - center
    src_pts = src_pts + np.array(face_padding_coefs) * src_direction

    dst_pts = np.array([
        [0, 0],
        [0, face_crop_size],
        [face_crop_size, face_crop_size],
        [face_crop_size, 0],
    ], dtype=np.float32)

    # Compute the homography matrix
    M, _ = cv2.findHomography(src_pts, dst_pts)
    warped_face_crop = cv2.warpPerspective(frame, M, (face_crop_size, face_crop_size))

    # Apply the homography matrix to the facial landmarks
    warped_facial_landmarks = np.dot(M, np.vstack((face_landmarks.T, np.ones((1, face_landmarks.shape[0])))))
    warped_facial_landmarks = (warped_facial_landmarks[:2, :] / warped_facial_landmarks[2, :]).T.astype(np.int32)

    # Generate crops for the eyes and each eye separately
    top_eyes_patch = warped_facial_landmarks[151]
    bottom_eyes_patch = warped_facial_landmarks[195]
    eyes_patch = warped_face_crop[top_eyes_patch[1]:bottom_eyes_patch[1], :]

    # Reshape the eyes patch to the same size
    eyes_patch = cv2.resize(eyes_patch, dst_img_size)
    return eyes_patch

def get_head_vector(rt):
    pitch, yaw, roll = rotation_matrix_to_euler_angles(rt[:3, :3])
    h_pitch, h_yaw, h_roll = -yaw, pitch, roll
    f_h = pitch_yaw_roll_to_gaze_vector(h_pitch, h_yaw, h_roll)
    return f_h

########################################################################################
# 3D Face Reconstruction
########################################################################################

def estimate_face_width(facial_landmarks_px, face_rt) -> float:

    # If the face is not facing near front, then we cannot estimate the face width
    # if face_rt[2, 2] < 0.9:
    #     return None

    # Compute the iris size in pixel
    iris_dist = []
    for side in ['left', 'right']:
        eye_iris_landmarks = LEFT_IRIS_LANDMARKS if side == 'left' else RIGHT_IRIS_LANDMARKS
        leftmost = facial_landmarks_px[eye_iris_landmarks[4], :2] 
        rightmost = facial_landmarks_px[eye_iris_landmarks[2], :2] 
        horizontal_dist = np.linalg.norm(leftmost - rightmost)
        # topmost = facial_landmarks_px[eye_iris_landmarks[1], :2]
        # bottommost = facial_landmarks_px[eye_iris_landmarks[3], :2]
        # vertical_dist = np.linalg.norm(topmost - bottommost)
        # avg_dist = (horizontal_dist + vertical_dist) / 2
        avg_dist = horizontal_dist
        iris_dist.append(avg_dist)

    # Use the iris size to estimate the face width
    avg_iris_dist = np.mean(iris_dist)
    face_width_px = np.linalg.norm(facial_landmarks_px[LEFTMOST_LANDMARK] - facial_landmarks_px[RIGHTMOST_LANDMARK])
    face_iris_ratio = avg_iris_dist / face_width_px

    # Estimate the face width
    face_width_cm = AVERAGE_IRIS_SIZE_CM / face_iris_ratio
    return face_width_cm

def estimate_inter_pupillary_distance_2d(facial_landmarks, height, width):
    data_2d_pairs = {
        'left': facial_landmarks[LEFT_EYE_LANDMARKS][:, :2] * np.array([width, height]),
        'right': facial_landmarks[RIGHT_EYE_LANDMARKS][:, :2] * np.array([width, height])
    }
    data_3d_pairs = {
        'left': facial_landmarks[LEFT_EYE_LANDMARKS][:, :3],
        'right': facial_landmarks[RIGHT_EYE_LANDMARKS][:, :3]
    }

    # Compute the 2D eye origin
    origins_2d = {}
    for k,v in data_2d_pairs.items():
        origins_2d[k] = compute_2d_origin(v)

    # Compute the 3D eye origin
    origins_3d = {}
    for k, v in data_3d_pairs.items():
        origins_3d[k] = np.mean(v, axis=0)

    # Compute the scaling factor between mediapipe canonical & world coordinate
    l, r = origins_3d['left'], origins_3d['right']
    canonical_ipd = np.sqrt(np.power(l[0] - r[0], 2) + np.power(l[1] - r[1],2) + np.power(l[2] - r[2], 2))

    # Compute the distance in 2d 
    l, r = origins_2d['left'], origins_2d['right']
    image_ipd = np.sqrt(np.power(l[0] - r[0], 2) + np.power(l[1] - r[1], 2))

    positions = {
        'eye_origins_2d': {
            'left': l,
            'right': r
        },
        'eye_origins_3d_canonical': {
            'left': origins_3d['left'],
            'right': origins_3d['right']
        }
    }
    distances = {
        'canonical_ipd_3d': canonical_ipd,
        'image_ipd': image_ipd
    }

    return (positions, distances)

def estimate_2d_3d_eye_face_origins(perspective_matrix, facial_landmarks, face_rt, height, width, intrinsics):

    # First, compute the inter-pupillary distance
    positions, distances = estimate_inter_pupillary_distance_2d(
        facial_landmarks, 
        height, 
        width
    )

    # Estimate the scale
    metric_scale = REAL_WORLD_IPD_CM * 10 / distances['canonical_ipd_3d']

    # Convert uvz to xyz
    relative_face_mesh = np.array([convert_uv_to_xyz(perspective_matrix, x[0], x[1], x[2]) for x in facial_landmarks[:, :3]])
    centroid = relative_face_mesh.mean(axis=0)
    demeaned_relative_face_mesh = relative_face_mesh.copy() # - centroid
    
    data_3d_pairs = {
        'left': demeaned_relative_face_mesh[LEFT_EYE_LANDMARKS][:, :3],
        'right': demeaned_relative_face_mesh[RIGHT_EYE_LANDMARKS][:, :3]
    }

    # Compute the 3D eye origin
    origins_3d = {}
    for k, v in data_3d_pairs.items():
        origins_3d[k] = np.mean(v, axis=0)

    # Compute the scaling factor between mediapipe per-world & world mm coordinate
    l, r = origins_3d['left'], origins_3d['right']
    per_frame_ipd = np.sqrt(np.power(l[0] - r[0], 2) + np.power(l[1] - r[1],2) + np.power(l[2] - r[2], 2))
    scale = (10 * REAL_WORLD_IPD_CM) / per_frame_ipd

    # Compute the depth
    theta = np.arctan(face_rt[0, 2] / face_rt[2, 2])
    focal_length_pixels = 1 / np.tan(np.deg2rad(VERTICAL_FOV_DEGREES) / 2) * height / 2
    depth_mm = (focal_length_pixels * REAL_WORLD_IPD_CM * 10 * np.cos(theta)) / distances['image_ipd'] * 2.25

    # Apply the scale
    scaled_demeaned_relative_face_mesh = demeaned_relative_face_mesh * scale

    # Returned to the position
    translation = np.array([0, 0, depth_mm])
    shifted_s_d_relative_face_mesh = scaled_demeaned_relative_face_mesh + translation
    
    # Compute the 3D bounding box dimensions of the shifted_s_d_relative_face_mesh
    min_xyz = np.min(shifted_s_d_relative_face_mesh, axis=0)
    max_xyz = np.max(shifted_s_d_relative_face_mesh, axis=0)
    distances = max_xyz - min_xyz
    # print(f"Distances: {distances}")

    # Estimate intrinsics based on width
    intrinsics = np.array([
        [width*1.5, 0, width / 2],
        [0, height*1.9, height / 2],
        [0, 0, 1]
    ])

    # Convert xyz back to uvz
    re_facial_landmarks = np.array([convert_xyz_to_uv_with_intrinsic(intrinsics, x[0], x[1], x[2]) for x in shifted_s_d_relative_face_mesh])

    # Draw the original facial (DEBUGGING)
    # draw_frame = frame.copy()
    # for (u,v), (nu, nv) in zip(facial_landmarks[:, :2], re_facial_landmarks[:, :2]):
    #     cv2.circle(draw_frame, (int(u * width), int(v * height)), 2, (0, 255, 0), -1)
    #     cv2.circle(draw_frame, (int(nu), int(nv)), 2, (0, 0, 255), -1)
    # cv2.imshow('draw', draw_frame)

    # Compute the average of the 2D eye origins
    face_origin = (positions['eye_origins_2d']['left'] + positions['eye_origins_2d']['right']) / 2
    tf_face_points = shifted_s_d_relative_face_mesh

    # Compute the eye gaze origin in metric space
    eye_g_o = {
        'left': tf_face_points[LEFT_EYE_LANDMARKS],
        'right': tf_face_points[RIGHT_EYE_LANDMARKS]
    }

    # Compute the 3D eye origin
    for k, v in eye_g_o.items():
        eye_g_o[k] = np.mean(v, axis=0)

    # Compute face gaze origin
    face_g_o = (eye_g_o['left'] + eye_g_o['right']) / 2

    return {
        'tf_face_points': tf_face_points,
        'face_origin_3d': face_g_o,
        'face_origin_2d': face_origin,
        'eye_origins_3d': eye_g_o,
        # 'eye_origins_3d': {'left': np.array([0,0,100]), 'right': np.array([0,0,100])},
        'eye_origins_2d': positions['eye_origins_2d']
    }

def face_reconstruction(perspective_matrix, face_landmarks, face_width_cm, face_rt, K, frame_width, frame_height, initial_z_guess=60, frame=None):

    # PERFORMANCE OPTIMIZATION: Perspective matrix is constant across all 478 landmarks.
    # Computing inverse once instead of 478 times provides ~10-50x speedup for this
    # operation with zero impact on accuracy. See MATRIX_INVERSION_ANALYSIS.md for details.
    inv_perspective_matrix = np.linalg.inv(perspective_matrix)

    # 1) Convert uvz to xyz using pre-inverted matrix (OPTIMIZED)
    relative_face_mesh = np.array([convert_uv_to_xyz_with_inverse(inv_perspective_matrix, x[0], x[1], x[2]) for x in face_landmarks[:, :3]])
    
    # 2) Center to the nose 
    nose = relative_face_mesh[4]
    relative_face_mesh = relative_face_mesh - nose
    relative_face_mesh *= np.array([-1, -1, 1])
    
    # 3) make the width of the face length=1
    euclidean_distance = np.linalg.norm(relative_face_mesh[LEFTMOST_LANDMARK] - relative_face_mesh[RIGHTMOST_LANDMARK])
    relative_face_mesh[:, :] /= euclidean_distance
    canonical_pts_3d = relative_face_mesh * face_width_cm

    # 4) Extract the face transformation matrix from MediaPipe
    face_r = face_rt[:3, :3].copy()
    pitch, yaw, roll = rotation_matrix_to_euler_angles(np.linalg.inv(face_r))
    pitch, yaw, roll = -yaw, pitch, roll # Flip the pitch and yaw
    face_r = euler_angles_to_rotation_matrix(pitch, yaw, roll)

    # 5) Derotate the face based face transformation matrix
    canonical_pts_3d = canonical_pts_3d @ np.linalg.inv(face_r).T

    # 6) Scale is embedded in face_r's columns
    scales = np.linalg.norm(face_r, axis=0)
    face_s = scales.mean()  # average scale
    face_r /= face_s

    # 7) Now we need to estimate the 3D position of the face
    # ---------------------------------------------------------------
    # (A) Build an initial 4x4 transform that has R, s, and some guess at Z
    #     For example, -60 in front of the camera
    # ---------------------------------------------------------------
    init_transform = np.eye(4, dtype=np.float32)
    init_transform[:3, :3] = face_r
    init_transform[:3, 3]  = np.array([0, 0, initial_z_guess], dtype=np.float32)

    # ---------------------------------------------------------------
    # (B) Project canonical mesh using this initial transform
    #     We'll get a set of 2D points in pixel space
    # ---------------------------------------------------------------
    camera_pts_3d = transform_3d_to_3d(canonical_pts_3d, init_transform)
    canonical_proj_2d = transform_3d_to_2d(
        camera_pts_3d, K 
    ).astype(np.float32)  # shape (N, 2)

    # ---------------------------------------------------------------
    # (C) Get the DETECTED 2D landmarks from MediaPipe
    #     They are in normalized [0..1], so multiply by width/height
    # ---------------------------------------------------------------
    detected_2d = face_landmarks[:, :2] * np.array([frame_width, frame_height])

    # ---------------------------------------------------------------
    # (D) Do partial Procrustes in 2D: translation only
    #     shift_2d = (mean(detected) - mean(canonical_proj))
    # ---------------------------------------------------------------
    shift_2d = partial_procrustes_translation_2d(canonical_proj_2d, detected_2d)

    # ---------------------------------------------------------------
    # (E) Convert that 2D shift to a 3D offset at depth initial_z_guess
    #     Then add it to the transform's translation
    # ---------------------------------------------------------------
    # Estimate the fx and fy based on the frame size
    shift_3d = image_shift_to_3d(shift_2d, depth_z=initial_z_guess, K=K)
    final_transform = init_transform.copy()
    final_transform[:3, 3] += shift_3d
    first_final_transform = final_transform.copy()

    # ---------------------------------------------------------------
    # (F) Refine the depth by projecting the canonical mesh
    #     and then adjusting the Z to minimize the radial error
    # ---------------------------------------------------------------
    new_zs = [initial_z_guess]
    for i in range(10):

        # First convert canonical pts to camera points
        camera_pts_3d = transform_3d_to_3d(canonical_pts_3d, final_transform)

        # Now do the final projection
        final_projected_pts = transform_3d_to_2d(
            camera_pts_3d, K
        )
        
        new_z = refine_depth_by_radial_magnitude(
            final_projected_pts, 
            detected_2d, 
            old_z=final_transform[2, 3], 
            alpha=0.5,
            # frame=frame
        )

        # Compute the difference of the Z
        new_zs.append(new_z)
        diff_z = new_z - final_transform[2, 3]
        if np.abs(diff_z) < 0.25:
            break

        # Use similar triangles to compute the new x and y
        prior_x = first_final_transform[0, 3]
        prior_y = first_final_transform[1, 3]
        new_x = prior_x * (new_z / initial_z_guess)
        new_y = prior_y * (new_z / initial_z_guess)

        # Compute the new xy shift
        final_transform[0, 3] = new_x
        final_transform[1, 3] = new_y
        final_transform[2, 3] = new_z
        # break

    # ---------------------------------------------------------------
    # (G) Apply the final transform to the canonical mesh to obtain
    #     the final 3D face mesh    
    # ---------------------------------------------------------------
    final_face_pts = transform_3d_to_3d(canonical_pts_3d, final_transform)

    return final_transform, final_face_pts

def estimate_gaze_origins(face_landmarks_3d, face_landmarks):

    eye_origins_2d = {'left': None, 'right': None}
    eye_origins_3d = {'left': None, 'right': None}
    for i in ['left', 'right']:
        eye_landmark = LEFT_EYE_HORIZONTAL_LANDMARKS if i == 'left' else RIGHT_EYE_HORIZONTAL_LANDMARKS
        eyeball_center_3d = face_landmarks_3d[eye_landmark].mean(axis=0)
        eyeball_center_2d = face_landmarks[eye_landmark].mean(axis=0)
        eye_origins_3d[i] = eyeball_center_3d
        eye_origins_2d[i] = eyeball_center_2d

    # Compute face gaze origin
    face_origin_3d = (eye_origins_3d['left'] + eye_origins_3d['right']) / 2
    face_origin_2d = (eye_origins_2d['left'] + eye_origins_2d['right']) / 2

    return {
        'face_origin_3d': face_origin_3d,
        'face_origin_2d': face_origin_2d,
        'eye_origins_3d': eye_origins_3d,
        'eye_origins_2d': eye_origins_2d
    }

########################################################################################
# Gaze Estimation
########################################################################################

def estimate_gaze_vector_based_on_model_based(
        eyeball_centers, 
        eyeball_radius, 
        perspective_matrix, 
        inv_perspective_matrix, 
        facial_landmarks, 
        face_rt, 
        height, 
        width, 
        ear_threshold=EAR_THRESHOLD
    ):
    
    # Estimate the eyeball centers
    face_rt_copy = face_rt.copy()
    face_rt_copy[:3, 3] *= np.array([-1, -1, -1])

    # Must for gaze estimation
    gaze_vectors = {}
    eye_closed = {}

    # Visualization for debug
    eyeball_center_2d = {'left': None, 'right': None}
    # eyeball_radius_2d = {'left': None, 'right': None}

    for i, canonical_eyeball in zip(['left', 'right'], eyeball_centers):
        # if i == 'right':
        #     eye_closed[i] = True
        #     continue

        # Convert to homogenous
        eyeball_homogeneous = np.append(canonical_eyeball, 1)

        # Convert from canonical to camera space
        camera_eyeball = face_rt_copy @ eyeball_homogeneous
        sphere_center = camera_eyeball[:3]

        # Obtain the 2D eyeball center and radius
        screen_landmark_homogenous = perspective_matrix @ camera_eyeball
        eyeball_x_2d_n = screen_landmark_homogenous[0] / screen_landmark_homogenous[2]
        eyeball_y_2d_n = screen_landmark_homogenous[1] / screen_landmark_homogenous[2]
        eyeball_x_2d = (eyeball_x_2d_n + 1) * width / 2
        eyeball_y_2d = (eyeball_y_2d_n * -1 + 1) * height / 2
        eyeball_center_2d[i] = np.array([eyeball_x_2d, eyeball_y_2d])
        # eyeball_radius_2d[i] = 0.85 * (500/camera_eyeball[2]) # TODO: This is not correct since the camera's instrinsics are not the same

        # print(f"A - {i}: canonical_eyeball: {canonical_eyeball}, face_rt_copy: {face_rt_copy}, width, height: {width, height}, eyeball_center_2d: {eyeball_center_2d[i]}")

        # Draw the eyeball center and radius
        # cv2.circle(frame, (int(eyeball_x_2d), int(eyeball_y_2d)), 2, (0, 0, 255), -1)
        
        # First, determine if the eye is closed, by computing the EAR
        # EAR = ||p_2 - p_6|| + ||p_3 - p_5|| / (2 * ||p_1 - p_4||)
        EYE_EAR_LANDMARKS = LEFT_EYE_EAR_LANDMARKS if i == 'left' else RIGHT_EYE_EAR_LANDMARKS
        p1 = facial_landmarks[EYE_EAR_LANDMARKS[0], :2]
        p2 = facial_landmarks[EYE_EAR_LANDMARKS[1], :2]
        p3 = facial_landmarks[EYE_EAR_LANDMARKS[2], :2]
        p4 = facial_landmarks[EYE_EAR_LANDMARKS[3], :2]
        p5 = facial_landmarks[EYE_EAR_LANDMARKS[4], :2]
        p6 = facial_landmarks[EYE_EAR_LANDMARKS[5], :2]

        # Draw all the EAR landmarks
        # for j, landmark in enumerate(EYE_EAR_LANDMARKS):
        #     x, y = facial_landmarks[landmark, :2]
        #     cv2.circle(frame, (int(x * width), int(y * height)), 2, (0, 255, 0), -1)
        #     cv2.putText(frame, f"p{j+1}", (int(x * width), int(y * height)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        ear = (np.linalg.norm(p2 - p6) + np.linalg.norm(p3 - p5)) / (2 * np.linalg.norm(p1 - p4))
        eye_closed[i] = False
        if ear < ear_threshold:
            eye_closed[i] = True
            continue

        # Compute the 3D pupil by using a line-sphere intersection problem
        # Reference: https://en.wikipedia.org/wiki/Line%E2%80%93sphere_intersection
        # Convert from 0-1 to -1 to 1
        pupil = facial_landmarks[LEFT_IRIS_LANDMARKS[0], :3] if i == 'left' else facial_landmarks[RIGHT_IRIS_LANDMARKS[0], :3]
        pupil2d = np.array([pupil[0] * width, pupil[1] * height])
        ndc_y = 1 - (2 * pupil2d[1] / height)
        ndc_x = (2 * pupil2d[0] / width) - 1
        ndc_point = np.array([ndc_x, ndc_y, -1.0, 1.9])
        
        # Draw the pupil
        # cv2.circle(frame, (int(pupil2d[0]), int(pupil2d[1])), 2, (0, 255, 0), -1)

        # Compute the ray in 3D space
        world_point_homogeneous = np.dot(inv_perspective_matrix, ndc_point)
        world_point = world_point_homogeneous[:3] / world_point_homogeneous[3]
        ray_direction = world_point - np.array([0, 0, 0])
        ray_direction /= np.linalg.norm(ray_direction)  # Normalize the direction
        
        # Camera origin and Calculate intersection with the sphere
        camera_origin = np.array([0.0, 0.0, 0.0])
        oc = camera_origin - sphere_center

        # Solve the quadratic equation ax^2 + bx + c = 0
        discriminant = np.dot(ray_direction, oc) ** 2 - (np.dot(oc, oc) - eyeball_radius ** 2)

        if discriminant < 0:
            # No real intersections
            # cv2.imshow('frame', imutils.resize(frame, width=1000))

            # if cv2.waitKey(1) & 0xFF == ord('q'):
            #     break
            continue
            # return None

        # Calculate the two possible intersection points
        t1 = np.dot(-ray_direction, oc) - np.sqrt(discriminant)
        t2 = np.dot(-ray_direction, oc) + np.sqrt(discriminant)

        # We are interested in the first intersection that is in front of the camera
        pupil_3d = None
        if t1 > t2:
            pupil_3d = camera_origin + t1 * ray_direction
        else:
            pupil_3d = camera_origin + t2 * ray_direction

        # Compute the gaze direction based on the eyeball center and 3D pupil
        gaze_vector = pupil_3d - sphere_center
        gaze_vector /= np.linalg.norm(gaze_vector)

        # DEBUG: For debugging purposes, make the gaze vector straight to the z-axis
        # gaze_vector = np.array([0, 0, -1])
        # gaze_vector = np.array([-0.1, 0.0, -0.9])
        # gaze_vector /= np.linalg.norm(gaze_vector)
        # gaze_vector = np.array([-0.04122334, -0.25422794, -0.96626538])

        # Convert gaze vector to pitch and yaw to correct
        pitch, yaw = vector_to_pitch_yaw(gaze_vector)
        pitch, yaw = -pitch, yaw
        gaze_vector = pitch_yaw_to_gaze_vector(pitch, yaw)

        # Store
        gaze_vectors[i] = gaze_vector

    # Compute the average gaze vector
    if 'left' in gaze_vectors and 'right' in gaze_vectors:
        face_gaze_vector = (gaze_vectors['left'] + gaze_vectors['right'])
        face_gaze_vector /= np.linalg.norm(face_gaze_vector)
    elif 'left' in gaze_vectors:
        face_gaze_vector = gaze_vectors['left']
        gaze_vectors['right'] = np.array([0,0,-1])
    elif 'right' in gaze_vectors:
        face_gaze_vector = gaze_vectors['right']
        gaze_vectors['left'] = np.array([0,0,-1])
    else:
        face_gaze_vector = np.array([0,0,-1])
        gaze_vectors['left'] = np.array([0,0,-1])
        gaze_vectors['right'] = np.array([0,0,-1])

    # Debugging purposes
    # cv2.imshow('debug_frame', frame)

    return {
        'face': face_gaze_vector,
        'eyes': {
            'is_closed': eye_closed,
            'vector': gaze_vectors,
            'meta_data': {
                'left': {
                    'eyeball_center_2d': eyeball_center_2d['left'],
                    # 'eyeball_radius_2d': eyeball_radius_2d['left']
                },
                'right': {
                    'eyeball_center_2d': eyeball_center_2d['right'],
                    # 'eyeball_radius_2d': eyeball_radius_2d['right']
                }
            }
        }
    }

def estimate_gaze_vector_based_on_eye_landmarks(facial_landmarks, face_rt, height, width):

    # Compute the bbox by using the edges of the each eyes
    left_2d_eye_px = facial_landmarks[LEFT_EYEAREA_LANDMARKS, :2] * np.array([height, width])
    left_2d_eyelid_px = facial_landmarks[LEFT_EYELID_LANDMARKS, :2] * np.array([height, width])
    left_2d_iris_px = facial_landmarks[LEFT_IRIS_LANDMARKS, :2] * np.array([height, width])
    
    right_2d_eye_px = facial_landmarks[RIGHT_EYEAREA_LANDMARKS, :2] * np.array([height, width])
    right_2d_eyelid_px = facial_landmarks[RIGHT_EYELID_LANDMARKS, :2] * np.array([height, width])
    right_2d_iris_px = facial_landmarks[RIGHT_IRIS_LANDMARKS, :2] * np.array([height, width])

    # Apply face_rt to the EYEBALL_CENTERs to get the 3D position
    # canonical_lefteye_center_homo = np.append(LEFT_EYEBALL_CENTER, 1)
    # canonical_righteye_center_homo = np.append(RIGHT_EYEBALL_CENTER, 1)
    # left_eye_ball_center = np.dot(face_rt[:3, :3], LEFT_EYEBALL_CENTER) + face_rt[:3, 3]
    # right_eye_ball_center = np.dot(face_rt[:3, :3], RIGHT_EYEBALL_CENTER) + face_rt[:3, 3]

    # tf_lefteye_center_homo = face_rt @ canonical_lefteye_center_homo
    # tf_lefteye_center = tf_lefteye_center_homo[:3] / tf_lefteye_center_homo[-1]
    # u_normalized = tf_lefteye_center[0] / width
    # v_normalized = tf_lefteye_center[1] / height
    # z_relative = tf_lefteye_center[2] / tf_lefteye_center[0]
    # actual_UVZ = facial_landmarks[LEFT_EYEAREA_LANDMARKS[0], :3]
    # UVZ = (u_normalized, v_normalized, z_relative)

    # 3D
    left_eye_fl = facial_landmarks[LEFT_EYELID_LANDMARKS, :3]
    right_eye_fl = facial_landmarks[RIGHT_EYELID_LANDMARKS, :3]

    left_landmarks = [
        left_2d_eye_px, 
        left_2d_eyelid_px,
    ]
    right_landmarks = [
        right_2d_eye_px, 
        right_2d_eyelid_px,
    ]

    eye_closed = {}
    eye_images = {}
    gaze_vectors = {}
    gaze_origins_2d = {}
    headpose_corrected_eye_center = {}
    for i, (eye, eyelid) in {'left': left_landmarks, 'right': right_landmarks}.items():
        centroid = np.mean(eye, axis=0)
        actual_width = np.abs(eye[1,0] - eye[0, 0])
        width = actual_width * (1 + EYE_PADDING_WIDTH)
        height = width * EYE_HEIGHT_RATIO

        gaze_origins_2d[i] = centroid

        # Determine if closed by the eyelid
        eyelid_width = np.abs(eyelid[0,0] - eyelid[1, 0])
        eyelid_height = np.abs(eyelid[3,1] - eyelid[2, 1])
        is_closed = False

        # Determine if the eye is closed by the ratio of the height based on the width
        if eyelid_height / eyelid_width < 0.05:
            is_closed = True

        if width == 0 or height == 0:
            continue

        # Draw if the eye is closed on the top left corner
        eye_closed[i] = is_closed
        if is_closed:
            continue

        # Shift the IRIS landmarks to the cropped eye
        iris_px = left_2d_iris_px if i == 'left' else right_2d_iris_px
        shifted_iris_px = iris_px - np.array([int(centroid[0] - width/2), int(centroid[1] - height/2)])
        iris_center = shifted_iris_px[0]
        eye_center = np.array([width/2, height/2])

        # Compute the radius of the iris
        left_iris_radius = np.linalg.norm(iris_center - shifted_iris_px[2])
        right_iris_radius = np.linalg.norm(iris_center - shifted_iris_px[4])
        iris_radius = np.mean([left_iris_radius, right_iris_radius]) # 10

        # Shift the eye center by the headpose
        headrot = face_rt[:3, :3]
        pitch, yaw, roll = rotation_matrix_to_euler_angles(headrot)
        pitch, yaw = yaw, -pitch # Swap the pitch and yaw
        size = actual_width / 4
        pitch = (pitch * np.pi / 180)
        yaw = (yaw * np.pi / 180)
        x3 = size * (math.sin(yaw))
        y3 = size * (-math.cos(yaw) * math.sin(pitch))
        # frame = draw_axis(frame, -pitch, yaw, 0, int(face_origin[0]), int(face_origin[1]), 100)

        old_iris_center = iris_px[0]
        # cv2.circle(frame, (int(old_iris_center[0]), int(old_iris_center[1])), 2, (0, 0, 255), -1)
        shifted_iris_center = old_iris_center + np.array([int(x3), int(y3)])
        # cv2.circle(frame, (int(shifted_iris_center[0]), int(shifted_iris_center[1])), 2, (0, 255, 0), -1)
        # cv2.line(frame, (int(old_iris_center[0]), int(old_iris_center[1])), (int(shifted_iris_center[0]), int(shifted_iris_center[1])), (0, 255, 0), 1)

        # Shifting the eye_center by the headpose
        # print(f"Eye center: {eye_center}, shift: {np.array([x3, y3])}, new: {eye_center + np.array([x3, y3])}")
        eye_center = eye_center + np.array([x3, y3])
        headpose_corrected_eye_center[i] = eye_center

        # Based on the direction and magnitude of the line, compute the gaze direction
        # Compute 2D vector from eyeball center to iris center
        # gaze_vector_2d = shifted_iris_px[0] - iris_px[0]
        gaze_vector_2d = iris_center - eye_center
        # gaze_vector_2d = np.array([0,0])

        # Estimate the depth (Z) based on the 2D vector length
        # z_depth = EYEBALL_RADIUS / np.linalg.norm(gaze_vector_2d)
        z_depth = 2.0
        # Estimate the depth (Z) based on the size of the iris
        # z_depth = EYEBALL_RADIUS

        # Compute yaw (horizontal rotation)
        yaw = np.arctan2(gaze_vector_2d[0] / iris_radius, z_depth) * (180 / np.pi)  # Convert from radians to degrees

        # Compute pitch (vertical rotation)
        pitch = np.arctan2(gaze_vector_2d[1] / iris_radius, z_depth) * (180 / np.pi)  # Convert from radians to degrees

        # Convert the pitch and yaw to a 3D vector
        gaze_vector = pitch_yaw_to_gaze_vector(pitch, yaw)
        gaze_vectors[i] = gaze_vector

        # # Compute 3D gaze origin
        # eye_fl = left_eye_fl if i == 'left' else right_eye_fl
        # gaze_origin = np.mean(eye_fl, axis=0)
        # gaze_origins[i] = gaze_origin

    # Compute average gaze origin 2d
    face_origin_2d = (gaze_origins_2d['left'] + gaze_origins_2d['right']) / 2

    # Draw the headpose on the frame
    # headrot = face_rt[:3, :3]
    # pitch, yaw, roll = rotation_matrix_to_euler_angles(headrot)
    # pitch, yaw = yaw, pitch
    # face_origin = face_origin_2d
    # frame = draw_axis(frame, -pitch, yaw, -roll, int(face_origin[0]), int(face_origin[1]), 100)

    # cv2.imshow('frame', frame)
    # if cv2.waitKey(0) & 0xFF == ord('q'):
    #     cv2.destroyAllWindows()
    #     exit()

    # Compute the average gaze vector
    if 'left' in gaze_vectors and 'right' in gaze_vectors:
        face_gaze_vector = (gaze_vectors['left'] + gaze_vectors['right'])
        face_gaze_vector /= np.linalg.norm(face_gaze_vector)
    elif 'left' in gaze_vectors:
        face_gaze_vector = gaze_vectors['left']
        gaze_vectors['right'] = np.array([0,0,1])
        headpose_corrected_eye_center['right'] = None
    elif 'right' in gaze_vectors:
        face_gaze_vector = gaze_vectors['right']
        gaze_vectors['left'] = np.array([0,0,1])
        headpose_corrected_eye_center['left'] = None
    else:
        face_gaze_vector = np.array([0,0,1])
        gaze_vectors['left'] = np.array([0,0,1])
        gaze_vectors['right'] = np.array([0,0,1])
        headpose_corrected_eye_center['left'] = None
        headpose_corrected_eye_center['right'] = None

    return {
        'face': face_gaze_vector,
        'eyes': {
            'is_closed': eye_closed,
            'vector': gaze_vectors,
            'meta_data': {
                'left': {
                    'headpose_corrected_eye_center': headpose_corrected_eye_center['left']
                },
                'right': {
                    'headpose_corrected_eye_center': headpose_corrected_eye_center['right']
                }
            }
        }
    }

def estimate_gaze_vector_based_on_eye_blendshapes(face_blendshapes, face_rt):

    # Get the transformation matrix
    # Invert the y and z axis
    transform = face_rt.copy()
    transform = np.diag([-1, 1, 1, 1]) @ transform
    
    # Compute the iris direction
    gaze_directions = {}
    for option, value in {'left': LEFT_BLENDSHAPES, 'right': RIGHT_BLENDSHAPES}.items():
        
        blendshapes = face_blendshapes
        look_in, look_out, look_up, look_down = ([blendshapes[i] for i in value])
        hfov = np.deg2rad(HFOV)
        vfov = np.deg2rad(VFOV)

        rx = hfov * 0.5 * (look_down - look_up)
        ry = vfov * 0.5 * (look_in - look_out) * (1 if option == 'left' else -1)

        # Create euler angle
        euler_angles = np.array([rx, -ry, 0])

        # # Convert to rotation matrix
        rotation_matrix = cv2.Rodrigues(euler_angles)[0]

        # Compute the gaze direction
        gaze_directions[option] = rotation_matrix

    # Apply the rotation to the gaze direction
    for k, v in gaze_directions.items():
        rotation_matrix = transform[:3, :3]
        gaze_directions[k] = v.dot(rotation_matrix)

    # Compute the gaze direction by apply the rotation to a [0,0,-1] vector
    gaze_vectors = {
        'left': np.array([0,0,-1]),
        'right': np.array([0,0,-1])
    }
    for k, v in gaze_directions.items():
        gaze_vectors[k] = v.dot(gaze_vectors[k])

    # Compute the average gaze vector
    face_gaze_vector = (gaze_vectors['left'] + gaze_vectors['right'])
    face_gaze_vector /= np.linalg.norm(face_gaze_vector)

    return {
        'face': face_gaze_vector,
        'eyes': {
            'is_closed': {'left': False, 'right': False},
            'vector': gaze_vectors,
            'meta_data': {
                'left': {},
                'right': {}
            }
        }            
    }

########################################################################################
# Screen Plane Intersection
########################################################################################

def screen_plane_intersection(o, d, screen_R, screen_t):
    """
    Calculate the intersection of a gaze direction with a screen plane.
    
    Parameters:
    - o: Gaze origin (3D coordinates)
    - d: Gaze direction (3D coordinates)
    - screen_R: Rotation vector (Rodrigues vector) for the screen
    - screen_t: Translation vector for the screen
    
    Returns:
    - pog: 2D point of gaze on the screen in (x, y) coordinates
    """

    # Obtain rotation matrix from the Rodrigues vector
    R_matrix, _ = cv2.Rodrigues(screen_R)  # screen_R should be a 3D vector (Rodrigues rotation)
    inv_R_matrix = np.linalg.inv(R_matrix)  # Inverse of the rotation matrix

    # Transform gaze origin and direction to screen coordinates
    o_s = np.dot(inv_R_matrix, (o - screen_t.T[0]))
    d_s = np.dot(inv_R_matrix, d)

    # Screen plane: z = 0 (assumed to be at origin with a normal vector along z-axis)
    a_s = np.array([0, 0, 0], dtype=np.float32)  # Point on the screen plane
    n_s = np.array([0, 0, 1], dtype=np.float32)  # Normal vector of the screen plane

    # Calculate the distance (lambda) to the screen plane
    lambda_ = np.dot(a_s - o_s, n_s) / np.dot(d_s, n_s)

    # Calculate the intersection point (3D)
    p = o_s + lambda_ * d_s

    # Keep only the x and y coordinates (2D point of gaze on screen)
    pog = p[:2]

    return pog

def screen_plane_intersection_2(o, d):
    """
    Calculate the intersection of a gaze direction with a screen plane.
    
    Parameters:
    - o: Gaze origin (3D coordinates)
    - d: Gaze direction (3D coordinates)
    
    Returns:
    - pog: 2D point of gaze on the screen in millimeters (x, y)
    """

    # Screen plane: z = 0 (assumed to be at origin with a normal vector along z-axis)
    a = np.array([0, 0, 0], dtype=np.float32)  # Point on the screen plane
    n = np.array([0, 0, 1], dtype=np.float32)  # Normal vector of the screen plane

    # Calculate the distance (lambda) to the screen plane
    lambda_ = np.dot(a - o, n) / np.dot(d, n)

    # Calculate the intersection point (3D)
    p = o + lambda_ * d

    # Keep only the x and y coordinates (2D point of gaze on screen)
    pog = p[:2]

    return pog

def compute_pog(
        gaze_origins, 
        gaze_vectors, 
        screen_RT, 
        screen_width_cm, 
        screen_height_cm, 
        screen_width_px, 
        screen_height_px) -> Tuple[PoGResult, Dict[str, PoGResult]]:
    
    # Extract the Gaze Origins
    left_gaze_origin = gaze_origins['eye_origins_3d']['left']
    right_gaze_origin = gaze_origins['eye_origins_3d']['right']
    
    # Perform intersection with plane using gaze origin and vector
    # c for camera, s for screen
    left_pog_cm_c = screen_plane_intersection_2(
        left_gaze_origin,
        gaze_vectors['eyes']['vector']['left'],
    )
    right_pog_cm_c = screen_plane_intersection_2(
        right_gaze_origin,
        gaze_vectors['eyes']['vector']['right'],
    )

    # Decompose the screen_RT into R and t
    inv_screen_RT = np.linalg.inv(screen_RT)

    # # Pad the points from 2 to 3 dimensions
    left_pog_cm_c = np.append(left_pog_cm_c, 0)
    right_pog_cm_c = np.append(right_pog_cm_c, 0)

    # # Transform gaze origin and direction to screen coordinates
    left_pog_cm_s = transform_3d_to_3d(left_pog_cm_c.reshape((-1,3)), inv_screen_RT).flatten()
    right_pog_cm_s = transform_3d_to_3d(right_pog_cm_c.reshape((-1,3)), inv_screen_RT).flatten()

    # Convert cm to normalized coordinates
    left_pog_norm = np.array([left_pog_cm_s[0] / screen_width_cm, left_pog_cm_s[1] / screen_height_cm])
    right_pog_norm = np.array([right_pog_cm_s[0] / screen_width_cm, right_pog_cm_s[1] / screen_height_cm])

    # Convert normalized coordinates to pixel coordinates
    left_pog_px = np.array([left_pog_norm[0] * screen_width_px, left_pog_norm[1] * screen_height_px])
    right_pog_px = np.array([right_pog_norm[0] * screen_width_px, right_pog_norm[1] * screen_height_px])

    return (
        PoGResult(
            pog_cm_c=(left_pog_cm_c + right_pog_cm_c) / 2,
            pog_cm_s=(left_pog_cm_s + right_pog_cm_s) / 2,
            pog_norm=(left_pog_norm + right_pog_norm) / 2,
            pog_px=((left_pog_px + right_pog_px) / 2).astype(np.int32)
        ),
        {
            'left': PoGResult(
                pog_cm_c=left_pog_cm_c,
                pog_cm_s=left_pog_cm_s,
                pog_norm=left_pog_norm,
                pog_px=left_pog_px.astype(np.int32)
            ),
            'right': PoGResult(
                pog_cm_c=right_pog_cm_c,
                pog_cm_s=right_pog_cm_s,
                pog_norm=right_pog_norm,
                pog_px=right_pog_px.astype(np.int32)
            )
        }
    )