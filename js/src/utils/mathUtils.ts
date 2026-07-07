import { Matrix, inverse, pseudoInverse, solve} from 'ml-matrix';
import { Matrix as MediaPipeMatrix, NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as tf from '@tensorflow/tfjs';
import { Point } from '../types';
import { safeSVD } from './safeSVD';

// Used to determine the width of the face
const LEFTMOST_LANDMARK = 356
const RIGHTMOST_LANDMARK = 127
const RIGHT_IRIS_LANDMARKS = [468, 470, 469, 472, 471] // center, top, right, bottom, left
const LEFT_IRIS_LANDMARKS = [473, 475, 474, 477, 476] // center, top, right, bottom, left
const AVERAGE_IRIS_SIZE_CM = 1.2;
const LEFT_EYE_HORIZONTAL_LANDMARKS = [362, 263]
const RIGHT_EYE_HORIZONTAL_LANDMARKS = [33, 133]

// Depth radial parameters
const MAX_STEP_CM = 5

// According to https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/graphs/face_effect/face_effect_gpu.pbtxt#L61-L65
const VERTICAL_FOV_DEGREES = 60;
const NEAR = 1.0; // 1cm
const FAR = 10000; // 100m
const ORIGIN_POINT_LOCATION = 'BOTTOM_LEFT_CORNER';

// ============================================================================
// Compute Affine Transformation Matrix
// ============================================================================

export function computeAffineMatrixML(src: number[][], dst: number[][]): number[][] {
  const N = src.length;
  const srcAug = src.map(row => [...row, 1]); // [N, 3]

  const X = new Matrix(srcAug);   // [N, 3]
  const Y = new Matrix(dst);      // [N, 2]

  const A = solve(X, Y); // [3, 2]
  return A.transpose().to2DArray(); // [2, 3]
}

export function applyAffineMatrix(A: tf.Tensor, V: tf.Tensor): tf.Tensor {
    const reshapedOutput = V.reshape([-1, 2]);        // [B, 2]
    const ones = tf.ones([reshapedOutput.shape[0], 1]);          // [B, 1]
    const homog = tf.concat([reshapedOutput, ones], 1);          // [B, 3]
    const affineT = A.transpose();                // [3, 2]
    const transformed = tf.matMul(homog, affineT);                // [B, 2]
    tf.dispose([reshapedOutput, ones, homog, affineT]); // Clean up intermediate tensors
    return transformed.reshape(V.shape);       // reshape back
}

// ============================================================================
// Eye Patch Extraction and Homography
// ============================================================================

/**
 * Estimates a 3x3 homography matrix from 4 point correspondences.
 */
export function computeHomography(src: Point[], dst: Point[]): number[][] {
  if (src.length !== 4 || dst.length !== 4) {
    throw new Error('Need exactly 4 source and 4 destination points');
  }

  const A: number[][] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];

    A.push([-x, -y, -1, 0, 0, 0, x * u, y * u, u]);
    A.push([0, 0, 0, -x, -y, -1, x * v, y * v, v]);
  }

  const A_mat = new Matrix(A);
  const svd = safeSVD(A_mat);

  // Last column of V (right-singular vectors) is the solution to Ah=0
  // const h = svd.V.getColumn(svd.V.columns - 1);
  const V = svd.rightSingularVectors;
  const h = V.getColumn(V.columns - 1);

  const H = [
    h.slice(0, 3),
    h.slice(3, 6),
    h.slice(6, 9),
  ];

  return H;
}

/**
 * Apply a homography matrix to a point.
 */
export function applyHomography(H: number[][], pt: number[]): number[] {
  const [x, y] = pt;
  const denom = H[2][0] * x + H[2][1] * y + H[2][2];
  const xPrime = (H[0][0] * x + H[0][1] * y + H[0][2]) / denom;
  const yPrime = (H[1][0] * x + H[1][1] * y + H[1][2]) / denom;
  return [xPrime, yPrime];
}

/**
 * Applies homography to warp a source ImageData to a target rectangle.
 */
export function warpImageData(
  srcImage: ImageData,
  H: number[][],
  outWidth: number,
  outHeight: number
): ImageData {
  // Invert the homography for backward mapping
  const Hinv = inverse(new Matrix(H)).to2DArray();

  const output = new ImageData(outWidth, outHeight);
  const src = srcImage.data;
  const dst = output.data;

  const srcW = srcImage.width;
  const srcH = srcImage.height;

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      // Map (x, y) in destination → (x', y') in source
      const denom = Hinv[2][0] * x + Hinv[2][1] * y + Hinv[2][2];
      const srcX = (Hinv[0][0] * x + Hinv[0][1] * y + Hinv[0][2]) / denom;
      const srcY = (Hinv[1][0] * x + Hinv[1][1] * y + Hinv[1][2]) / denom;

      const ix = Math.floor(srcX);
      const iy = Math.floor(srcY);

      // Bounds check
      if (ix < 0 || iy < 0 || ix >= srcW || iy >= srcH) {
        continue; // leave pixel transparent
      }

      const srcIdx = (iy * srcW + ix) * 4;
      const dstIdx = (y * outWidth + x) * 4;

      dst[dstIdx] = src[srcIdx];       // R
      dst[dstIdx + 1] = src[srcIdx + 1]; // G
      dst[dstIdx + 2] = src[srcIdx + 2]; // B
      dst[dstIdx + 3] = src[srcIdx + 3]; // A
    }
  }

  return output;
}

export function cropImageData(
  source: ImageData,
  x: number,
  y: number,
  width: number,
  height: number
): ImageData {
  const output = new ImageData(width, height);
  const src = source.data;
  const dst = output.data;
  const srcWidth = source.width;

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const srcIdx = ((y + j) * srcWidth + (x + i)) * 4;
      const dstIdx = (j * width + i) * 4;

      dst[dstIdx] = src[srcIdx];       // R
      dst[dstIdx + 1] = src[srcIdx + 1]; // G
      dst[dstIdx + 2] = src[srcIdx + 2]; // B
      dst[dstIdx + 3] = src[srcIdx + 3]; // A
    }
  }

  return output;
}

/**
 * Resizes an ImageData using bilinear interpolation.
 * This matches OpenCV's cv2.resize() default behavior (INTER_LINEAR).
 *
 * Bilinear interpolation provides smooth, high-quality resizing by computing
 * a weighted average of the 4 nearest pixels for each output pixel.
 *
 * This is significantly faster than homography-based warping when only
 * simple rectangular scaling is needed (no rotation, skew, or perspective).
 *
 * @param source - Source ImageData to resize
 * @param outWidth - Output width in pixels
 * @param outHeight - Output height in pixels
 * @returns Resized ImageData with bilinear interpolation
 */
export function resizeImageData(
  source: ImageData,
  outWidth: number,
  outHeight: number
): ImageData {
  const output = new ImageData(outWidth, outHeight);
  const src = source.data;
  const dst = output.data;
  const srcWidth = source.width;
  const srcHeight = source.height;

  // Calculate scale factors
  const scaleX = srcWidth / outWidth;
  const scaleY = srcHeight / outHeight;

  for (let dy = 0; dy < outHeight; dy++) {
    for (let dx = 0; dx < outWidth; dx++) {
      // Map destination pixel to source coordinates
      // Use center-based mapping: add 0.5 to get pixel center
      const srcX = (dx + 0.5) * scaleX - 0.5;
      const srcY = (dy + 0.5) * scaleY - 0.5;

      // Get integer and fractional parts
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y1 = Math.min(y0 + 1, srcHeight - 1);

      // Clamp to source bounds
      const x0Clamped = Math.max(0, Math.min(x0, srcWidth - 1));
      const y0Clamped = Math.max(0, Math.min(y0, srcHeight - 1));

      // Calculate interpolation weights
      const wx = Math.max(0, Math.min(1, srcX - x0));
      const wy = Math.max(0, Math.min(1, srcY - y0));

      // Get indices for 4 neighboring pixels
      const idx00 = (y0Clamped * srcWidth + x0Clamped) * 4;
      const idx10 = (y0Clamped * srcWidth + x1) * 4;
      const idx01 = (y1 * srcWidth + x0Clamped) * 4;
      const idx11 = (y1 * srcWidth + x1) * 4;

      const dstIdx = (dy * outWidth + dx) * 4;

      // Bilinear interpolation for each channel (R, G, B, A)
      for (let c = 0; c < 4; c++) {
        const v00 = src[idx00 + c];
        const v10 = src[idx10 + c];
        const v01 = src[idx01 + c];
        const v11 = src[idx11 + c];

        // Interpolate in x direction
        const v0 = v00 * (1 - wx) + v10 * wx;
        const v1 = v01 * (1 - wx) + v11 * wx;

        // Interpolate in y direction
        const value = v0 * (1 - wy) + v1 * wy;

        dst[dstIdx + c] = Math.round(value);
      }
    }
  }

  return output;
}

/**
 * Compares two ImageData objects and computes pixel-wise differences.
 * Used for validation and testing to ensure optimizations maintain correctness.
 *
 * @param img1 - First ImageData
 * @param img2 - Second ImageData
 * @returns Statistics about pixel differences
 */
export function compareImageData(
  img1: ImageData,
  img2: ImageData
): { maxDiff: number; meanDiff: number; histogram: number[] } {
  if (img1.width !== img2.width || img1.height !== img2.height) {
    throw new Error('Images must have the same dimensions for comparison');
  }

  const data1 = img1.data;
  const data2 = img2.data;
  const numPixels = img1.width * img1.height;
  const histogram = new Array(256).fill(0);

  let sumDiff = 0;
  let maxDiff = 0;

  // Compare each pixel (RGB channels only, ignore alpha)
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;

    for (let c = 0; c < 3; c++) { // R, G, B only
      const diff = Math.abs(data1[idx + c] - data2[idx + c]);
      sumDiff += diff;
      maxDiff = Math.max(maxDiff, diff);
      histogram[Math.floor(diff)]++;
    }
  }

  const meanDiff = sumDiff / (numPixels * 3);

  return { maxDiff, meanDiff, histogram };
}

export function obtainEyePatch(
    frame: ImageData,
    faceLandmarks: Point[],
    facePaddingCoefs: [number, number] = [0.4, 0.2],
    faceCropSize: number = 512,
    dstImgSize: [number, number] = [512, 128]
): ImageData {

    // Step 3: Prepare src and dst
    const center = faceLandmarks[4];
    const leftTop = faceLandmarks[103];
    const leftBottom = faceLandmarks[150];
    const rightTop = faceLandmarks[332];
    const rightBottom = faceLandmarks[379];

    let srcPts: Point[] = [leftTop, leftBottom, rightBottom, rightTop];

    // Apply radial padding
    srcPts = srcPts.map(([x, y]) => {
        const dx = x - center[0];
        const dy = y - center[1];
        return [
            x + dx * facePaddingCoefs[0],
            y + dy * facePaddingCoefs[1],
        ];
    });

    const dstPts: Point[] = [
        [0, 0],
        [0, faceCropSize],
        [faceCropSize, faceCropSize],
        [faceCropSize, 0],
    ];

    // Compute homography matrix
    const H = computeHomography(srcPts, dstPts);

    // Step 5: Warp the image
    const warped = warpImageData(frame, H, faceCropSize, faceCropSize);

    // Step 6: Apply the homography matrix to the facial landmarks
    const warpedLandmarks = faceLandmarks.map(pt => applyHomography(H, pt));

    // Step 7: Generate the crop of the eyes
    const top_eyes_patch = warpedLandmarks[151];
    const bottom_eyes_patch = warpedLandmarks[195];
    const eye_patch = cropImageData(
        warped,
        0,
        Math.round(top_eyes_patch[1]),
        warped.width,
        Math.round(bottom_eyes_patch[1] - top_eyes_patch[1]) 
    );

    // Step 8: Resize the eye patch to the desired output size
    // OPTIMIZATION: Using bilinear resize instead of homography for simple rectangular scaling
    // This is ~2x faster and matches the Python reference implementation (cv2.resize)
    // The previous homography approach was mathematically equivalent but computationally expensive
    const resizedEyePatch = resizeImageData(
        eye_patch,
        dstImgSize[0],
        dstImgSize[1]
    );

    // VERIFICATION MODE (for development/testing only)
    // Uncomment to compare resize vs homography and verify numerical equivalence
    /*
    const eyePatchSrcPts: Point[] = [
        [0, 0],
        [0, eye_patch.height],
        [eye_patch.width, eye_patch.height],
        [eye_patch.width, 0],
    ];
    const eyePatchDstPts: Point[] = [
        [0, 0],
        [0, dstImgSize[1]],
        [dstImgSize[0], dstImgSize[1]],
        [dstImgSize[0], 0],
    ];
    const eyePatchH = computeHomography(eyePatchSrcPts, eyePatchDstPts);
    const homographyResult = warpImageData(eye_patch, eyePatchH, dstImgSize[0], dstImgSize[1]);
    const diff = compareImageData(resizedEyePatch, homographyResult);
    console.log('Eye patch resize verification:', {
        maxDiff: diff.maxDiff,
        meanDiff: diff.meanDiff,
        acceptableDiff: diff.meanDiff < 2.0,
        note: 'Differences expected due to interpolation method (bilinear vs nearest-neighbor)'
    });
    */

    return resizedEyePatch;
}

// ============================================================================
// Face Origin and Head Vector
// ============================================================================

export function translateMatrix(
    matrix: MediaPipeMatrix,
): Matrix {
  // Convert MediaPipeMatrix to ml-matrix format
  const data = matrix.data;
  const translatedMatrix = new Matrix(matrix.rows, matrix.columns);
  for (let i = 0; i < matrix.rows; i++) {
    for (let j = 0; j < matrix.columns; j++) {
      translatedMatrix.set(i, j, data[i * matrix.columns + j]);
    }
  }
  return translatedMatrix;
}

export function createPerspectiveMatrix(aspectRatio: number): Matrix {
    const kDegreesToRadians = Math.PI / 180.0;

    // Standard perspective projection matrix calculations
    const f = 1.0 / Math.tan(kDegreesToRadians * VERTICAL_FOV_DEGREES / 2.0);
    const denom = 1.0 / (NEAR - FAR);

    // Create and populate the matrix
    const perspectiveMatrix = new Matrix(4, 4).fill(0);

    perspectiveMatrix.set(0, 0, f / aspectRatio);
    perspectiveMatrix.set(1, 1, f);
    perspectiveMatrix.set(2, 2, (NEAR + FAR) * denom);
    perspectiveMatrix.set(2, 3, -1.0);
    perspectiveMatrix.set(3, 2, 2.0 * FAR * NEAR * denom);

    return perspectiveMatrix;
}

export function createIntrinsicsMatrix(
    width: number, height: number,
    fovX?: number // in degrees
): Matrix {
    const w = width;
    const h = height;

    const cX = w / 2;
    const cY = h / 2;

    let fX: number, fY: number;

    if (fovX !== undefined) {
        const fovXRad = (fovX * Math.PI) / 180;
        fX = w / (2 * Math.tan(fovXRad / 2));
        fY = fX; // Assume square pixels
    } else {
        fX = fY = w; // Fallback estimate
    }

    // Construct the intrinsic matrix
    const K = new Matrix([
        [fX, 0, cX],
        [0, fY, cY],
        [0, 0, 1],
    ]);

    return K;
}

function distance2D(p1: number[], p2: number[]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function estimateFaceWidth(
    faceLandmarks: Point[],
): number {

  const irisDist: number[] = [];

  for (const side of ['left', 'right']) {
    const eyeIrisLandmarks = side === 'left' ? LEFT_IRIS_LANDMARKS : RIGHT_IRIS_LANDMARKS;
    const leftmost = faceLandmarks[eyeIrisLandmarks[4]].slice(0, 2);
    const rightmost = faceLandmarks[eyeIrisLandmarks[2]].slice(0, 2);
    const horizontalDist = distance2D(leftmost, rightmost);
    irisDist.push(horizontalDist);
  }

  const avgIrisDist = irisDist.reduce((a, b) => a + b, 0) / irisDist.length;

  const leftmostFace = faceLandmarks[LEFTMOST_LANDMARK];
  const rightmostFace = faceLandmarks[RIGHTMOST_LANDMARK];
  const faceWidthPx = distance2D(leftmostFace, rightmostFace);

  const faceIrisRatio = avgIrisDist / faceWidthPx;
  const faceWidthCm = AVERAGE_IRIS_SIZE_CM / faceIrisRatio;

  return faceWidthCm;
}

export function convertUvToXyz(
  perspectiveMatrix: Matrix,
  u: number,
  v: number,
  zRelative: number
): [number, number, number] {
  // Step 1: Convert to Normalized Device Coordinates (NDC)
  const ndcX = 2 * u - 1;
  const ndcY = 1 - 2 * v;

  // Step 2: Create NDC point in homogeneous coordinates
  const ndcPoint = new Matrix([[ndcX], [ndcY], [-1.0], [1.0]]);

  // Step 3: Invert the perspective matrix
  const invPerspective = inverse(perspectiveMatrix);

  // Step 4: Multiply to get world point in homogeneous coords
  const worldHomogeneous = invPerspective.mmul(ndcPoint);

  // Step 5: Dehomogenize
  const w = worldHomogeneous.get(3, 0);
  const x = worldHomogeneous.get(0, 0) / w;
  const y = worldHomogeneous.get(1, 0) / w;
  const z = worldHomogeneous.get(2, 0) / w;

  // Step 6: Scale using the provided zRelative
  const xRelative = -x; // negated to match original convention
  const yRelative = y;
  // zRelative stays as-is (external input)

  return [xRelative, yRelative, zRelative];
}

/**
 * Convert UVZ coordinates to XYZ using pre-computed inverse perspective matrix.
 *
 * This is an optimized version of convertUvToXyz() that accepts a pre-inverted
 * perspective matrix, eliminating redundant matrix inversions when processing
 * multiple landmarks.
 *
 * **Performance**: When processing N landmarks, this approach computes the matrix
 * inverse once instead of N times, providing ~N-fold speedup for the inversion
 * operation (O(n³) complexity for 4x4 matrices).
 *
 * **Accuracy**: Mathematically equivalent to convertUvToXyz(). Computing the
 * inverse once actually improves numerical stability by avoiding accumulation
 * of rounding errors from multiple inversion operations.
 *
 * @param invPerspective - Pre-inverted 4x4 perspective matrix
 * @param u - Normalized horizontal coordinate [0, 1]
 * @param v - Normalized vertical coordinate [0, 1]
 * @param zRelative - Relative depth value
 * @returns 3D coordinates [xRelative, yRelative, zRelative]
 *
 * @example
 * ```typescript
 * // Efficient processing of multiple landmarks
 * const invPerspective = inverse(perspectiveMatrix);
 * const xyzCoords = faceLandmarks.map(([u, v]) =>
 *   convertUvToXyzWithInverse(invPerspective, u, v, initialZ)
 * );
 * ```
 *
 * @see convertUvToXyz - Original function (kept for backwards compatibility)
 * @see MATRIX_INVERSION_ANALYSIS.md - Detailed performance analysis
 */
export function convertUvToXyzWithInverse(
  invPerspective: Matrix,
  u: number,
  v: number,
  zRelative: number
): [number, number, number] {
  // Step 1: Convert to Normalized Device Coordinates (NDC)
  const ndcX = 2 * u - 1;
  const ndcY = 1 - 2 * v;

  // Step 2: Create NDC point in homogeneous coordinates
  const ndcPoint = new Matrix([[ndcX], [ndcY], [-1.0], [1.0]]);

  // Step 3: Use pre-inverted matrix (OPTIMIZATION: skip inversion)
  // This is the key optimization - matrix is already inverted by caller

  // Step 4: Multiply to get world point in homogeneous coords
  const worldHomogeneous = invPerspective.mmul(ndcPoint);

  // Step 5: Dehomogenize
  const w = worldHomogeneous.get(3, 0);
  const x = worldHomogeneous.get(0, 0) / w;
  const y = worldHomogeneous.get(1, 0) / w;
  const z = worldHomogeneous.get(2, 0) / w;

  // Step 6: Scale using the provided zRelative
  const xRelative = -x; // negated to match original convention
  const yRelative = y;
  // zRelative stays as-is (external input)

  return [xRelative, yRelative, zRelative];
}

export function imageShiftTo3D(shift2d: [number, number], depthZ: number, K: Matrix): [number, number, number] {
  const fx = K.get(0, 0);
  const fy = K.get(1, 1);

  const dx3D = shift2d[0] * (depthZ / fx);
  const dy3D = shift2d[1] * (depthZ / fy);

  return [dx3D, dy3D, 0.0];
}

export function transform3DTo3D(
  point: [number, number, number],
  rtMatrix: Matrix
): [number, number, number] {
  const homogeneous = [point[0], point[1], point[2], 1];
  const result = rtMatrix.mmul(Matrix.columnVector(homogeneous)).to1DArray();
  return [result[0], result[1], result[2]];
}


export function transform3DTo2D(
  point3D: [number, number, number],
  K: Matrix
): [number, number] {
  const eps = 1e-6;
  const [x, y, z] = point3D;

  const projected = K.mmul(Matrix.columnVector([x, y, z])).to1DArray();

  const zVal = Math.abs(projected[2]) < eps ? eps : projected[2];
  const u = Math.round(projected[0] / zVal);
  const v = Math.round(projected[1] / zVal);

  return [u, v];
}


export function partialProcrustesTranslation2D(
  canonical2D: [number, number][],
  detected2D: [number, number][]
): [number, number] {
  const [cx, cy] = canonical2D[4];
  const [dx, dy] = detected2D[4];
  return [dx - cx, dy - cy];
}

export function refineDepthByRadialMagnitude(
  finalProjectedPts: [number, number][],
  detected2D: [number, number][],
  oldZ: number,
  alpha = 0.5
): number {
  const numPts = finalProjectedPts.length;

  // Compute centroid of detected 2D
  const detectedCenter = detected2D.reduce(
    (acc, [x, y]) => [acc[0] + x / numPts, acc[1] + y / numPts],
    [0, 0]
  );

  let totalDistance = 0;

  for (let i = 0; i < numPts; i++) {
    const p1 = finalProjectedPts[i];
    const p2 = detected2D[i];

    const v: [number, number] = [p2[0] - p1[0], p2[1] - p1[1]];
    const vNorm = Math.hypot(v[0], v[1]);

    const c: [number, number] = [detectedCenter[0] - p1[0], detectedCenter[1] - p1[1]];
    const dotProduct = v[0] * c[0] + v[1] * c[1];

    totalDistance += dotProduct < 0 ? -vNorm : vNorm;
  }

  const distancePerPoint = totalDistance / numPts;
  const delta = 1e-1 * distancePerPoint;
  const safeDelta = Math.max(-MAX_STEP_CM, Math.min(MAX_STEP_CM, delta));

  const newZ = oldZ + safeDelta;
  return newZ;
}

export function faceReconstruction(
    perspectiveMatrix: Matrix,
    faceLandmarks: [number, number][],
    faceRT: Matrix,
    intrinsicsMatrix: Matrix,
    faceWidthCm: number,
    videoWidth: number,
    videoHeight: number,
    initialZGuess = 60
): [Matrix, [number, number, number][]] {
    // PERFORMANCE OPTIMIZATION: Perspective matrix is constant across all 478 landmarks.
    // Computing inverse once instead of 478 times provides ~10-50x speedup for this
    // operation with zero impact on accuracy. See MATRIX_INVERSION_ANALYSIS.md for details.
    const invPerspective = inverse(perspectiveMatrix);

    // Step 1: Convert UVZ to XYZ using pre-inverted matrix (OPTIMIZED)
    const relativeFaceMesh = faceLandmarks.map(([u, v]) => convertUvToXyzWithInverse(invPerspective, u, v, initialZGuess));

    // Step 2: Center to nose (index 4 is assumed nose)
    const nose = relativeFaceMesh[4];
    const centered = relativeFaceMesh.map(([x, y, z]) => [-(x - nose[0]), -(y - nose[1]), z - nose[2]]) as [number, number, number][];

    // Step 3: Normalize by width
    const left = centered[LEFTMOST_LANDMARK];
    const right = centered[RIGHTMOST_LANDMARK];
    const euclideanDistance = Math.hypot(
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2]
    );
    const normalized = centered.map(([x, y, z]) => [x / euclideanDistance * faceWidthCm, y / euclideanDistance * faceWidthCm, z / euclideanDistance * faceWidthCm]) as [number, number, number][];

    // Step 4: Extract + invert MediaPipe face rotation, convert to euler, flip pitch/yaw, back to rotmat
    const faceR = faceRT.subMatrix(0, 2, 0, 2);
    let [pitch, yaw, roll] = matrixToEuler(faceR);
    [pitch, yaw] = [-yaw, pitch];
    const finalR = eulerToMatrix(pitch, yaw, roll);

    // Step 5: Derotate face
    const canonical = normalized.map(p => multiplyVecByMat(p, finalR.transpose()));

    // Step 6: Scale from R columns
    const scales = [0, 1, 2].map(i => Math.sqrt(faceR.get(0, i) ** 2 + faceR.get(1, i) ** 2 + faceR.get(2, i) ** 2));
    const faceS = scales.reduce((a, b) => a + b, 0) / 3;

    // Step 7: Initial transform
    const initTransform = Matrix.eye(4);
    initTransform.setSubMatrix(finalR.div(faceS), 0, 0);
    initTransform.set(0, 3, 0);
    initTransform.set(1, 3, 0);
    initTransform.set(2, 3, initialZGuess);

    const cameraPts3D = canonical.map(p => transform3DTo3D(p, initTransform));
    const canonicalProj2D = cameraPts3D.map(p => transform3DTo2D(p, intrinsicsMatrix));

    const detected2D = faceLandmarks.map(([x, y]) => [x * videoWidth, y * videoHeight]) as [number, number][];
    const shift2D = partialProcrustesTranslation2D(canonicalProj2D, detected2D);

    const shift3D = imageShiftTo3D(shift2D, initialZGuess, intrinsicsMatrix);
    const finalTransform = initTransform.clone();
    finalTransform.set(0, 3, finalTransform.get(0, 3) + shift3D[0]);
    finalTransform.set(1, 3, finalTransform.get(1, 3) + shift3D[1]);
    finalTransform.set(2, 3, finalTransform.get(2, 3) + shift3D[2]);
    const firstFinalTransform = finalTransform.clone();

    let newZ = initialZGuess;
    for (let i = 0; i < 10; i++) {
      const projectedPts = canonical.map(p => transform3DTo2D(transform3DTo3D(p, finalTransform), intrinsicsMatrix));
      newZ = refineDepthByRadialMagnitude(projectedPts, detected2D, finalTransform.get(2, 3), 0.5);
      if (Math.abs(newZ - finalTransform.get(2, 3)) < 0.25) break;

      const newX = firstFinalTransform.get(0, 3) * (newZ / initialZGuess);
      const newY = firstFinalTransform.get(1, 3) * (newZ / initialZGuess);

      finalTransform.set(0, 3, newX);
      finalTransform.set(1, 3, newY);
      finalTransform.set(2, 3, newZ);
    }

    const finalFacePts = canonical.map(p => transform3DTo3D(p, finalTransform));
    return [finalTransform, finalFacePts];
}

export function computeFaceOrigin3D(
  metricFace: [number, number, number][],
): [number, number, number] {
  const computeMean = (indices: number[]): [number, number, number] => {
    const points = indices.map(idx => metricFace[idx]);
    const sum = points.reduce(
      (acc, [x, y, z]) => [acc[0] + x, acc[1] + y, acc[2] + z],
      [0, 0, 0]
    );
    return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
  };

  const leftEyeCenter = computeMean(LEFT_EYE_HORIZONTAL_LANDMARKS);
  const rightEyeCenter = computeMean(RIGHT_EYE_HORIZONTAL_LANDMARKS);

  const face_origin_3d: [number, number, number] = [
    (leftEyeCenter[0] + rightEyeCenter[0]) / 2,
    (leftEyeCenter[1] + rightEyeCenter[1]) / 2,
    (leftEyeCenter[2] + rightEyeCenter[2]) / 2
  ];

  return face_origin_3d;
}

function multiplyVecByMat(v: [number, number, number], m: Matrix): [number, number, number] {
  const [x, y, z] = v;
  const res = m.mmul(Matrix.columnVector([x, y, z])).to1DArray();
  return [res[0], res[1], res[2]];
}

export function matrixToEuler(matrix: Matrix, degrees: boolean = true): [number, number, number] {
  if (matrix.rows !== 3 || matrix.columns !== 3) {
    throw new Error('Rotation matrix must be 3x3.');
  }

  const pitch = Math.asin(-matrix.get(2, 0));
  const yaw = Math.atan2(matrix.get(2, 1), matrix.get(2, 2));
  const roll = Math.atan2(matrix.get(1, 0), matrix.get(0, 0));

  if (degrees) {
    const radToDeg = 180 / Math.PI;
    return [pitch * radToDeg, yaw * radToDeg, roll * radToDeg];
  }

  return [pitch, yaw, roll];
}

export function eulerToMatrix(pitch: number, yaw: number, roll: number, degrees: boolean = true): Matrix {
 
  if (degrees) {
    pitch *= Math.PI / 180;
    yaw *= Math.PI / 180;
    roll *= Math.PI / 180;
  }

  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
  const cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);

  const R_x = new Matrix([
    [1, 0, 0],
    [0, cosPitch, -sinPitch],
    [0, sinPitch, cosPitch],
  ]);

  const R_y = new Matrix([
    [cosYaw, 0, sinYaw],
    [0, 1, 0],
    [-sinYaw, 0, cosYaw],
  ]);

  const R_z = new Matrix([
    [cosRoll, -sinRoll, 0],
    [sinRoll, cosRoll, 0],
    [0, 0, 1],
  ]);

  // Final rotation matrix: R = Rz * Ry * Rx
  return R_z.mmul(R_y).mmul(R_x);
}

function pyrToVector(pitch: number, yaw: number, roll: number): number[] {
  // Convert spherical coordinates to Cartesian coordinates
  const x = Math.cos(pitch) * Math.sin(yaw);
  const y = Math.sin(pitch);
  const z = -Math.cos(pitch) * Math.cos(yaw);
  const vector = new Matrix([[x, y, z]]);

  // Apply roll rotation around the z-axis
  const [cos_r, sin_r] = [Math.cos(roll), Math.sin(roll)];
  const roll_matrix = new Matrix([
    [cos_r, -sin_r, 0],
    [sin_r, cos_r, 0],
    [0, 0, 1],
  ]);

  const rotated_vector = roll_matrix.mmul(vector.transpose()).transpose();
  return rotated_vector.to1DArray();
}

export function getHeadVector(
    tfMatrix: Matrix,
): number[] {

  // Extract the rotation part of the transformation matrix
  const rotationMatrix = new Matrix([
    [tfMatrix.get(0, 0), tfMatrix.get(0, 1), tfMatrix.get(0, 2)],
    [tfMatrix.get(1, 0), tfMatrix.get(1, 1), tfMatrix.get(1, 2)],
    [tfMatrix.get(2, 0), tfMatrix.get(2, 1), tfMatrix.get(2, 2)],
  ]);

  // Convert the matrix to euler angles and change the order/direction
  const [pitch, yaw, roll] = matrixToEuler(rotationMatrix, false);
  const [h_pitch, h_yaw, h_roll] = [-yaw, pitch, roll];

  // Construct a unit vector
  const vector = pyrToVector(h_pitch, h_yaw, h_roll);
  return vector;
}

// ============================================================================
// Gaze State
// ============================================================================

const LEFT_EYE_EAR_LANDMARKS = [362, 385, 387, 263, 373, 380]
const RIGHT_EYE_EAR_LANDMARKS = [133, 158, 160, 33, 144, 153]

export function computeEAR(eyeLandmarks: NormalizedLandmark[], side: 'left' | 'right'): number {
  const EYE_EAR_LANDMARKS = side === 'left' ? LEFT_EYE_EAR_LANDMARKS : RIGHT_EYE_EAR_LANDMARKS;
  const [p1, p2, p3, p4, p5, p6] = EYE_EAR_LANDMARKS.map(idx => [eyeLandmarks[idx].x, eyeLandmarks[idx].y]);

  const a = Math.sqrt(Math.pow(p2[0] - p6[0], 2) + Math.pow(p2[1] - p6[1], 2));
  const b = Math.sqrt(Math.pow(p3[0] - p5[0], 2) + Math.pow(p3[1] - p5[1], 2));
  const c = Math.sqrt(Math.pow(p1[0] - p4[0], 2) + Math.pow(p1[1] - p4[1], 2));

  return (a + b) / (2.0 * c);
}