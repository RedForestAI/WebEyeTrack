from typing import Optional, Literal

import numpy as np
import cv2
import platform

MAX_STEP_CM = 5
from .constants import *

########################################################################################
# OS Utilities
########################################################################################

def get_screen_attributes():
    """
    Get the screen attributes based on the operating system.

    Returns:
    - screen_height_cm (float): Screen height in centimeters.
    - screen_width_cm (float): Screen width in centimeters.
    - screen_height_px (int): Screen height in pixels.
    - screen_width_px (int): Screen width in pixels.
    """
    if platform.system() == 'Windows' or platform.system() == 'Linux':
        from screeninfo import get_monitors
        m = get_monitors()[0]
        screen_height_cm = m.height_mm / 10
        screen_width_cm = m.width_mm / 10
        screen_height_px = m.height
        screen_width_px = m.width
    elif platform.system() == 'Darwin':
        import Quartz
        main_display_id = Quartz.CGMainDisplayID()
        width_mm, height_mm = Quartz.CGDisplayScreenSize(main_display_id)
        width_px, height_px = Quartz.CGDisplayPixelsWide(main_display_id), Quartz.CGDisplayPixelsHigh(main_display_id)
        screen_height_cm = height_mm / 10
        screen_width_cm = width_mm / 10
        screen_height_px = height_px
        screen_width_px = width_px

    return screen_height_cm, screen_width_cm, screen_height_px, screen_width_px

########################################################################################
# Math Utilities
########################################################################################

def rotation_matrix_to_euler_angles(R, degrees=True):
    # Ensure the matrix is 3x3
    assert R.shape == (3, 3)
    
    # Extract pitch, yaw, roll from the rotation matrix
    pitch = np.arcsin(-R[2, 0])  # Pitch around X-axis
    yaw = np.arctan2(R[2, 1], R[2, 2])  # Yaw around Y-axis
    roll = np.arctan2(R[1, 0], R[0, 0])  # Roll around Z-axis (optional)
# 
    # Convert radians to degrees if necessary
    if degrees:
        pitch = np.degrees(pitch)
        yaw = np.degrees(yaw)
        roll = np.degrees(roll)

    return pitch, yaw, roll

def euler_angles_to_rotation_matrix(pitch, yaw, roll):

    # Convert degrees to radians
    pitch = np.radians(pitch)
    yaw = np.radians(yaw)
    roll = np.radians(roll)

    # Compute rotation matrix from Euler angles
    R_x = np.array([[1, 0, 0],
                    [0, np.cos(pitch), -np.sin(pitch)],
                    [0, np.sin(pitch), np.cos(pitch)]])
    
    R_y = np.array([[np.cos(yaw), 0, np.sin(yaw)],
                    [0, 1, 0],
                    [-np.sin(yaw), 0, np.cos(yaw)]])
    
    R_z = np.array([[np.cos(roll), -np.sin(roll), 0],
                    [np.sin(roll), np.cos(roll), 0],
                    [0, 0, 1]])
    
    R = np.dot(R_z, np.dot(R_y, R_x))
    
    return R

def pitch_yaw_to_gaze_vector(pitch, yaw):
    """
    Converts pitch and yaw angles into a 3D gaze direction vector (unit vector),
    with pitch=0 and yaw=0 corresponding to a gaze direction [0, 0, -1] (forward).

    Arguments:
    pitch -- pitch angle in degrees
    yaw -- yaw angle in degrees

    Returns:
    A 3D unit gaze direction vector as a numpy array [x, y, z].
    """
    # Convert degrees to radians
    pitch_rad = np.radians(pitch)
    yaw_rad = np.radians(yaw)

    # Calculate the 3D gaze vector using spherical-to-Cartesian transformation
    z = -np.cos(pitch_rad) * np.cos(yaw_rad)  # Z becomes the negative forward direction
    x = np.cos(pitch_rad) * np.sin(yaw_rad)   # X is horizontal
    y = np.sin(pitch_rad)                     # Y is vertical

    # Return the 3D gaze vector
    return np.array([x, y, z])

    import numpy as np

def pitch_yaw_roll_to_gaze_vector(pitch, yaw, roll):
    """
    Converts pitch, yaw, and roll angles into a 3D gaze direction vector (unit vector).
    - Pitch: Up/down rotation
    - Yaw: Left/right rotation
    - Roll: Rotation around the gaze direction

    Arguments:
    pitch -- pitch angle in degrees
    yaw -- yaw angle in degrees
    roll -- roll angle in degrees

    Returns:
    A 3D unit gaze direction vector as a numpy array [x, y, z].
    """
    # Convert degrees to radians
    pitch_rad = np.radians(pitch)
    yaw_rad = np.radians(yaw)
    roll_rad = np.radians(roll)

    # Calculate initial gaze vector (ignoring roll)
    z = -np.cos(pitch_rad) * np.cos(yaw_rad)  # Forward (negative Z direction)
    x = np.cos(pitch_rad) * np.sin(yaw_rad)   # Right
    y = np.sin(pitch_rad)                     # Up

    gaze_vector = np.array([x, y, z])

    # Apply roll rotation using a rotation matrix
    cos_r, sin_r = np.cos(roll_rad), np.sin(roll_rad)
    roll_matrix = np.array([
        [cos_r, -sin_r, 0],
        [sin_r,  cos_r, 0],
        [0,      0,     1]
    ])

    # Apply roll rotation to the (x, y) components
    rotated_vector = roll_matrix @ gaze_vector

    return rotated_vector


def vector_to_pitch_yaw(vector, degrees=True):
    """
    Converts a 3D gaze direction vector (unit vector) into pitch and yaw angles,
    assuming [0, 0, -1] corresponds to pitch=0 and yaw=0 (forward direction).

    Arguments:
    vector -- 3D unit gaze direction vector as a numpy array [x, y, z].

    Returns:
    pitch -- pitch angle in degrees
    yaw -- yaw angle in degrees
    """
    # Ensure the input vector is normalized (unit vector)
    vector = vector / np.linalg.norm(vector)
    
    # Extract components
    x, y, z = vector
    
    # Yaw (azimuth angle): the angle in the XZ plane from the Z-axis
    yaw = np.arctan2(x, -z)  # In radians, between -π and π, Z is negative now
    
    # Pitch (elevation angle): the angle from the XZ plane
    pitch = np.arctan2(y, np.sqrt(x**2 + z**2))  # In radians, between -π/2 and π/2

    # Convert radians to degrees
    if degrees:
        yaw = np.degrees(yaw)
        pitch = np.degrees(pitch)
    
    return pitch, yaw

def get_rotation_matrix_from_vector(vec):
    """
    Generates a rotation matrix that aligns the Z-axis with the input 3D unit vector.
    """
    # Normalize the input vector to ensure it's a unit vector
    vec = vec / np.linalg.norm(vec)
    x, y, z = vec
    
    # Default Z-axis vector
    z_axis = np.array([0, 0, 1])
    
    # Cross product to find the axis of rotation
    axis = np.cross(z_axis, vec)
    axis_len = np.linalg.norm(axis)
    
    if axis_len != 0:
        axis = axis / axis_len  # Normalize the rotation axis
    
    # Angle between the Z-axis and the input vector
    angle = np.arccos(np.dot(z_axis, vec))
    
    # Compute rotation matrix using axis-angle formula (Rodrigues' rotation formula)
    K = np.array([[0, -axis[2], axis[1]],
                  [axis[2], 0, -axis[0]],
                  [-axis[1], axis[0], 0]])
    
    R = np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * np.dot(K, K)
    
    return R

def compute_2d_origin(points):
    (cx, cy), radius = cv2.minEnclosingCircle(points.astype(np.float32))
    center = np.array([cx, cy], dtype=np.int32)
    return center

def create_perspective_matrix(aspect_ratio):
    k_degrees_to_radians = np.pi / 180.0

    # Initialize a 4x4 matrix filled with zeros
    perspective_matrix = np.zeros((4, 4), dtype=np.float32)

    # Standard perspective projection matrix calculations
    f = 1.0 / np.tan(k_degrees_to_radians * VERTICAL_FOV_DEGREES / 2.0)
    denom = 1.0 / (NEAR - FAR)

    # Populate the matrix values
    perspective_matrix[0, 0] = f / aspect_ratio
    perspective_matrix[1, 1] = f
    perspective_matrix[2, 2] = (NEAR + FAR) * denom
    perspective_matrix[2, 3] = -1.0
    perspective_matrix[3, 2] = 2.0 * FAR * NEAR * denom

    # Flip Y-axis if origin point location is top-left corner
    if ORIGIN_POINT_LOCATION == 'TOP_LEFT_CORNER':
        perspective_matrix[1, 1] *= -1.0

    return perspective_matrix

def convert_uv_to_xyz(perspective_matrix, u, v, z_relative):
    # Step 1: Convert normalized (u, v) to Normalized Device Coordinates (NDC)
    ndc_x = 2 * u - 1
    ndc_y = 1 - 2 * v

    # Step 2: Create the NDC point in homogeneous coordinates
    ndc_point = np.array([ndc_x, ndc_y, -1.0, 1.0])

    # Step 3: Invert the perspective matrix to go from NDC to world space
    inv_perspective_matrix = np.linalg.inv(perspective_matrix)

    # Step 4: Compute the point in world space (in homogeneous coordinates)
    world_point_homogeneous = np.dot(inv_perspective_matrix, ndc_point)

    # Step 5: Dehomogenize (convert from homogeneous to Cartesian coordinates)
    x = world_point_homogeneous[0] / world_point_homogeneous[3]
    y = world_point_homogeneous[1] / world_point_homogeneous[3]
    z = world_point_homogeneous[2] / world_point_homogeneous[3]

    # Step 6: Scale using the relative depth
    # Option A
    x_relative = -x #* z_relative
    y_relative = y #* z_relative
    # z_relative = z * z_relative

    # Option B
    # x_relative = x * z_relative
    # y_relative = y * z_relative
    # z_relative = z * z_relative

    return np.array([x_relative, y_relative, z_relative])

def convert_uv_to_xyz_with_inverse(inv_perspective_matrix, u, v, z_relative):
    """
    Convert UVZ coordinates to XYZ using pre-computed inverse perspective matrix.

    This is an optimized version of convert_uv_to_xyz() that accepts a pre-inverted
    perspective matrix, eliminating redundant matrix inversions when processing
    multiple landmarks.

    Performance: When processing N landmarks, this approach computes the matrix
    inverse once instead of N times, providing ~N-fold speedup for the inversion
    operation (O(n³) complexity for 4x4 matrices).

    Accuracy: Mathematically equivalent to convert_uv_to_xyz(). Computing the
    inverse once actually improves numerical stability by avoiding accumulation
    of rounding errors from multiple inversion operations.

    Args:
        inv_perspective_matrix (np.ndarray): Pre-inverted 4x4 perspective matrix
        u (float): Normalized horizontal coordinate [0, 1]
        v (float): Normalized vertical coordinate [0, 1]
        z_relative (float): Relative depth value

    Returns:
        np.ndarray: 3D coordinates [x_relative, y_relative, z_relative]

    Example:
        >>> # Efficient processing of multiple landmarks
        >>> inv_matrix = np.linalg.inv(perspective_matrix)
        >>> xyz_coords = [convert_uv_to_xyz_with_inverse(inv_matrix, u, v, z)
        ...               for u, v, z in landmarks]

    See Also:
        convert_uv_to_xyz(): Original function (kept for backwards compatibility)
        MATRIX_INVERSION_ANALYSIS.md: Detailed performance analysis
    """
    # Step 1: Convert normalized (u, v) to Normalized Device Coordinates (NDC)
    ndc_x = 2 * u - 1
    ndc_y = 1 - 2 * v

    # Step 2: Create the NDC point in homogeneous coordinates
    ndc_point = np.array([ndc_x, ndc_y, -1.0, 1.0])

    # Step 3: Use pre-inverted perspective matrix (OPTIMIZATION: skip inversion)
    # This is the key optimization - matrix is already inverted by caller

    # Step 4: Compute the point in world space (in homogeneous coordinates)
    world_point_homogeneous = np.dot(inv_perspective_matrix, ndc_point)

    # Step 5: Dehomogenize (convert from homogeneous to Cartesian coordinates)
    x = world_point_homogeneous[0] / world_point_homogeneous[3]
    y = world_point_homogeneous[1] / world_point_homogeneous[3]
    z = world_point_homogeneous[2] / world_point_homogeneous[3]

    # Step 6: Scale using the relative depth
    # Option A
    x_relative = -x #* z_relative
    y_relative = y #* z_relative
    # z_relative = z * z_relative

    # Option B
    # x_relative = x * z_relative
    # y_relative = y * z_relative
    # z_relative = z * z_relative

    return np.array([x_relative, y_relative, z_relative])

def convert_xyz_to_uv(perspective_matrix, x, y, z):
    # Step 1: Convert (x, y, z) to homogeneous coordinates (x, y, z, 1)
    world_point = np.array([x, -y, z, 1.0])
    # world_point = np.array([x, y, z, 1.0])

    # Step 2: Apply the perspective projection matrix
    ndc_point_homogeneous = np.dot(perspective_matrix, world_point)

    # Step 3: Dehomogenize to convert from homogeneous to Cartesian coordinates
    u_ndc = ndc_point_homogeneous[0] / ndc_point_homogeneous[3]
    v_ndc = ndc_point_homogeneous[1] / ndc_point_homogeneous[3]
    z_ndc = ndc_point_homogeneous[2] / ndc_point_homogeneous[3]

    # Step 4: Convert from NDC to normalized coordinates (u, v) in the range [0, 1]
    u = (u_ndc + 1) / 2
    v = (1 - v_ndc) / 2

    return u, v

def convert_xyz_to_uv_with_intrinsic(intrinsic_matrix, x, y, z):
    # Step 1: Create the 3D point in homogeneous coordinates
    point_3d = np.array([-x, -y, z, 1.0])

    # Step 2: Project the 3D point to the image plane using the intrinsic matrix
    # Remove the homogeneous component before applying K
    point_3d_camera = point_3d[:3]  # Only use x, y, z

    # Apply the intrinsic matrix to project to 2D
    projected_point_homogeneous = np.dot(intrinsic_matrix, point_3d_camera)

    # Step 3: Dehomogenize to convert to Cartesian coordinates (u, v)
    u = projected_point_homogeneous[0] / projected_point_homogeneous[2]
    v = projected_point_homogeneous[1] / projected_point_homogeneous[2]

    return np.array([u, v])

def create_rotation_matrix(rotation, rotation_type: Literal['degrees', 'radians'] = 'degrees'):
    """
    Creates a rotation matrix with deg vector.
    
    Parameters:
    - rotation (list or np.array): Rotation vector in degrees [pitch, yaw, roll].
    
    Returns:
    - rotation matrix(np.array): 3x3 transformation matrix.
    """
    # Convert rotation from degrees to radians
    if rotation_type == 'degrees':
        pitch, yaw, roll = np.radians(rotation)
    else:
        pitch, yaw, roll = rotation
    
    # Rotation matrices
    R_x = np.array([
        [1, 0, 0],
        [0, np.cos(pitch), -np.sin(pitch)],
        [0, np.sin(pitch), np.cos(pitch)]
    ])
    
    R_y = np.array([
        [np.cos(yaw), 0, np.sin(yaw)],
        [0, 1, 0],
        [-np.sin(yaw), 0, np.cos(yaw)]
    ])
    
    R_z = np.array([
        [np.cos(roll), -np.sin(roll), 0],
        [np.sin(roll), np.cos(roll), 0],
        [0, 0, 1]
    ])
    
    # Combine rotations into a single matrix (R = Rz * Ry * Rx)
    R = R_z @ R_y @ R_x
    return R

def create_transformation_matrix(scale, translation, rotation, rotation_type: Literal['degrees', 'radians'] = 'degrees'):
    """
    Creates a transformation matrix with scaling, translation, and rotation.
    
    Parameters:
    - scale (float): Scaling scalar value.
    - translation (list or np.array): Translation vector in cm [tx, ty, tz].
    - rotation (list or np.array): Rotation vector in degrees [pitch, yaw, roll].
    
    Returns:
    - transformation_matrix (np.array): 4x4 transformation matrix.
    """
    # Convert the rotation vector to matrix
    if isinstance(rotation, np.ndarray):
        if rotation.shape == (3, 3):
            R = rotation
        elif rotation.shape == (3,1):
            R = create_rotation_matrix(rotation.flatten(), rotation_type)
        elif rotation.shape == (3,):
            R = create_rotation_matrix(rotation, rotation_type)
        else:
            raise ValueError("Invalid rotation matrix shape")
    
    if isinstance(translation, np.ndarray):
        if translation.shape == (3, 1):
            translation = translation.flatten()
     
    # Apply scaling to the rotation matrix
    R *= scale
    
    # Create the 4x4 transformation matrix
    transformation_matrix = np.eye(4)
    transformation_matrix[:3, :3] = R  # Top-left 3x3 part is the rotation (scaled)
    transformation_matrix[:3, 3] = translation  # Last column is the translation vector
    
    return transformation_matrix

OPEN3D_RT = create_transformation_matrix(1, np.array([0,0,50]), np.array([0,180,180]))
OPEN3D_RT_SCREEN = create_transformation_matrix(1, np.array([0,0,80]), np.array([0,320,180]))

def transform_for_3d_scene(pts, RT=OPEN3D_RT):
    """
    Apply a RT transformation to the points to get the desired 3D scene.
    """
    pts_h = np.hstack([pts, np.ones((pts.shape[0], 1), dtype=np.float32)])
    transformed_pts_h = (RT @ pts_h.T).T
    return transformed_pts_h[:, :3]

def estimate_camera_intrinsics(frame, fov_x=None):
    """
    Estimate focal length and camera intrinsic parameters.
    
    Parameters:
    - frame: NumPy array representing the image.
    - fov_x: Horizontal field of view of the camera in degrees (optional).
    
    Returns:
    - K: Intrinsics matrix (3x3).
    """
    h, w = frame.shape[:2]
    
    # Assume optical center is at the image center
    c_x = w / 2
    c_y = h / 2
    
    if fov_x is not None:
        # Convert FOV from degrees to radians
        fov_x_rad = np.radians(fov_x)
        # Estimate focal length in pixels
        f_x = w / (2 * np.tan(fov_x_rad / 2))
        f_y = f_x  # Assume square pixels (f_x = f_y)
    else:
        # If no FOV is provided, assume a generic focal length
        f_x = f_y = w  # Rough estimate (assuming 1 pixel ≈ 1 focal length)
    
    # Construct the camera intrinsic matrix
    K = np.array([
        [f_x, 0, c_x],
        [0, f_y, c_y],
        [0,  0,   1]
    ])
    
    return K

def refine_depth_by_radial_magnitude(
    final_projected_pts: np.ndarray,
    detected_2d: np.ndarray,
    old_z: float,
    alpha: float = 0.5,
    frame: Optional[np.ndarray] = None,
) -> float:
    """
    Refines the face depth (Z) by comparing the radial 2D magnitude
    from the center of the face in 'final_projected_pts' versus
    the center of the face in 'detected_2d'.

    Args:
      final_projected_pts: (N, 2) the 2D projection of the canonical mesh
                          AFTER we've aligned X/Y.
      detected_2d:        (N, 2) the detected landmarks in pixel coords.
      old_z:              float, the current guess for Z (negative if forward).
      alpha:              a blending factor [0..1]. 0 -> no update, 1 -> full update.

    Returns:
      new_z: float, the updated depth
    """
    # Make a copy of the frame
    if frame is not None:
        draw_frame = frame.copy()
    else:
        draw_frame = None

    # Compute the centroid of the detected 2D points
    detected_center = detected_2d.mean(axis=0)
    total_distance = 0
    # Draw the center
    if frame is not None:
        cv2.circle(draw_frame, tuple(detected_center.astype(np.int32)), 10, (0, 255, 255), -1)

    # For each landmark pair, draw the lines between
    for i in range(len(final_projected_pts)):
        p1 = final_projected_pts[i]
        p2 = detected_2d[i]

        # Determine if the line is pointing towards the center
        # of the detected face or away from it.
        # Vector from p1 to p2
        v = p2 - p1
        v_norm = np.linalg.norm(v)

        # Vector from p1 to the detected center
        c = detected_center - p1
        dot_product = np.dot(v, c)
        if dot_product < 0:
            # The line is pointing towards the center
            # Draw the line in red
            color = (0, 0, 255)
            total_distance -= v_norm
        else:
            # The line is pointing away from the center
            # Draw the line in green
            color = (0, 255, 0)
            total_distance += v_norm

        if frame is not None:
            cv2.line(draw_frame, tuple(p1.astype(np.int32)), tuple(p2.astype(np.int32)), color, 2)
            # cv2.circle(draw_frame, tuple(p1.astype(np.int32)), 3, (0,255,0), -1)
            # cv2.circle(draw_frame, tuple(p2.astype(np.int32)), 3, (0,0,255), -1)

    if frame is not None:
        cv2.imshow('procrustes', draw_frame)

    distance_per_point = total_distance / len(final_projected_pts)
    # print(f"Distance per point: {distance_per_point}")

    # Use the total distance to update the depth
    delta = 1e-1 * distance_per_point
    safe_delta = max(-MAX_STEP_CM, min(MAX_STEP_CM, delta))
    new_z = old_z + safe_delta

    return new_z

def partial_procrustes_translation_2d(canonical_2d, detected_2d):
    # c_center = canonical_2d.mean(axis=0)
    # d_center = detected_2d.mean(axis=0)
    # return d_center - c_center
    c_nose = canonical_2d[4]
    d_nose = detected_2d[4]
    return d_nose - c_nose

def line_sphere_intersection(line_origin, line_direction, sphere_center, sphere_radius):
    # line_origin = np.array([0, 0, 0])
    
    # Camera origin and Calculate intersection with the sphere
    oc = line_origin - sphere_center

    # Solve the quadratic equation ax^2 + bx + c = 0
    discriminant = np.dot(line_direction, oc) ** 2 - (np.dot(oc, oc) - sphere_radius ** 2)

    if discriminant < 0:
        return None

    # Calculate the two possible intersection points
    t1 = np.dot(-line_direction, oc) - np.sqrt(discriminant)
    t2 = np.dot(-line_direction, oc) + np.sqrt(discriminant)

    # We are interested in the first intersection that is in front of the camera
    intersection_pt = None
    if t1 > t2:
    # if abs(t1) < abs(t2):
        intersection_pt = line_origin + t1 * line_direction
    else:
        intersection_pt = line_origin + t2 * line_direction
    return intersection_pt

def image_shift_to_3d(shift_2d, depth_z, K):
    fx = K[0, 0]
    fy = K[1, 1]
    dx_3d = shift_2d[0] * (depth_z / fx)
    dy_3d = shift_2d[1] * (depth_z / fy)
    return np.array([dx_3d, dy_3d, 0.0], dtype=np.float32)


def transform_3d_to_3d(pts_3d, rt_matrix):
    # same as you had before, with perspective divide...
    num_points = len(pts_3d)
    pts_3d_h= np.hstack([
        pts_3d, 
        np.ones((num_points, 1), dtype=np.float32)
    ])
    transformed_points_h = (rt_matrix @ pts_3d_h.T).T
    transformed_xyz = transformed_points_h[:, :3]
    return transformed_xyz

def transform_3d_to_2d(camera_pts_3d, K):
    camera_space = (K @ camera_pts_3d.T).T

    eps = 1e-6
    zs = np.where(np.abs(camera_space[:, 2]) < eps, eps, camera_space[:, 2])
    camera_space[:, 0] /= zs
    camera_space[:, 1] /= zs

    projected_points = camera_space[:, :2]
    projected_points = projected_points.astype(np.int32)
    return projected_points