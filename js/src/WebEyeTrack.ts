import { FaceLandmarkerResult, NormalizedLandmark, Matrix as MediaPipeMatrix } from "@mediapipe/tasks-vision";
import * as tf from '@tensorflow/tfjs';
import { Matrix } from 'ml-matrix';

import { Point, GazeResult } from "./types";
import BlazeGaze from "./BlazeGaze";
import FaceLandmarkerClient from "./FaceLandmarkerClient";
import { IDisposable } from "./IDisposable";
import { 
  computeFaceOrigin3D, 
  createIntrinsicsMatrix, 
  createPerspectiveMatrix, 
  translateMatrix, 
  faceReconstruction, 
  estimateFaceWidth, 
  getHeadVector, 
  obtainEyePatch, 
  computeEAR,
  computeAffineMatrixML,
  applyAffineMatrix
} from "./utils/mathUtils";
import { KalmanFilter2D } from "./utils/filter";

// Reference
// https://mediapipe-studio.webapps.google.com/demo/face_landmarker

interface SupportX {
  eyePatches: tf.Tensor;
  headVectors: tf.Tensor;
  faceOrigins3D: tf.Tensor;
}

function generateSupport(
  eyePatches: ImageData[],
  headVectors: number[][],
  faceOrigins3D: number[][],
  normPogs: number[][]
): { supportX: SupportX, supportY: tf.Tensor } {

  // Implementation for generating support samples
  const supportX: SupportX = {
    eyePatches: tf.stack(eyePatches.map(patch => tf.browser.fromPixels(patch)), 0).toFloat().div(tf.scalar(255.0)), // Convert ImageData to tensor
    headVectors: tf.tensor(headVectors, [headVectors.length, 3], 'float32'),
    faceOrigins3D: tf.tensor(faceOrigins3D, [faceOrigins3D.length, 3], 'float32')
  };

  // Convert normPogs to tensor
  const supportY = tf.tensor(normPogs, [normPogs.length, 2], 'float32');

  return { supportX, supportY };
}

export default class WebEyeTrack implements IDisposable {

  // Instance variables
  private blazeGaze: BlazeGaze;
  private faceLandmarkerClient: FaceLandmarkerClient;
  private faceWidthComputed: boolean = false;
  private faceWidthCm: number = -1;
  private perspectiveMatrixSet: boolean = false;
  private perspectiveMatrix: Matrix = new Matrix(4, 4);
  private intrinsicsMatrixSet: boolean = false;
  private intrinsicsMatrix: Matrix = new Matrix(3, 3);
  private affineMatrix: tf.Tensor | null = null;
  private kalmanFilter: KalmanFilter2D;
  private _disposed: boolean = false;

  // Public variables
  public loaded: boolean = false;
  public latestMouseClick: { x: number, y: number, timestamp: number } | null = null;
  public latestGazeResult: GazeResult | null = null;

  // Separate buffers for calibration (persistent) vs clickstream (ephemeral) points
  public calibData: {
    // === PERSISTENT CALIBRATION BUFFER (never evicted) ===
    calibSupportX: SupportX[],
    calibSupportY: tf.Tensor[],
    calibTimestamps: number[],

    // === TEMPORAL CLICKSTREAM BUFFER (TTL + FIFO eviction) ===
    clickSupportX: SupportX[],
    clickSupportY: tf.Tensor[],
    clickTimestamps: number[],
  } = {
    calibSupportX: [],
    calibSupportY: [],
    calibTimestamps: [],
    clickSupportX: [],
    clickSupportY: [],
    clickTimestamps: [],
  };

  // Configuration
  public maxCalibPoints: number = 4;    // Max calibration points (4-point or 9-point calibration)
  public maxClickPoints: number = 5;    // Max clickstream points (FIFO + TTL)
  public clickTTL: number = 60;         // Time-to-live for click points in seconds

  constructor(
      maxPoints: number = 5,              // Deprecated: use maxClickPoints instead
      clickTTL: number = 60,              // Time-to-live for click points in seconds
      maxCalibPoints?: number,            // Max calibration points (4 or 9 typically)
      maxClickPoints?: number             // Max clickstream points
    ) {

    // Initialize services
    this.blazeGaze = new BlazeGaze();
    this.faceLandmarkerClient = new FaceLandmarkerClient();
    this.kalmanFilter = new KalmanFilter2D();

    // Storing configs with backward compatibility
    this.maxCalibPoints = maxCalibPoints ?? 4;           // Default: 4-point calibration
    this.maxClickPoints = maxClickPoints ?? maxPoints;   // Use maxClickPoints if provided, else maxPoints
    this.clickTTL = clickTTL;
  }

  async initialize(modelPath?: string): Promise<void> {
    await this.faceLandmarkerClient.initialize();
    await this.blazeGaze.loadModel(modelPath);
    await this.warmup();
    this.loaded = true;
  }

  /**
   * Pre-warms TensorFlow.js execution pipeline by running dummy forward/backward passes.
   * This compiles WebGL shaders and optimizes computation graphs before first real usage.
   */
  async warmup(): Promise<void> {
    console.log('🔥 Starting TensorFlow.js warmup...');
    const warmupStart = performance.now();

    // Warmup iterations match total buffer capacity to exercise all code paths
    const numWarmupIterations = this.maxCalibPoints + this.maxClickPoints;

    for (let iteration = 1; iteration <= numWarmupIterations; iteration++) {
      await tf.nextFrame(); // Yield to prevent blocking

      const iterationStart = performance.now();

      // Create dummy tensors matching expected shapes
      // Eye patch: ImageData(width=512, height=128) -> tensor [batch, height, width, channels]
      const dummyEyePatch = tf.randomUniform([1, 128, 512, 3], 0, 1); // [batch, H=128, W=512, channels]
      const dummyHeadVector = tf.randomUniform([1, 3], -1, 1);
      const dummyFaceOrigin3D = tf.randomUniform([1, 3], -100, 100);
      const dummyTarget = tf.randomUniform([1, 2], -0.5, 0.5);

      // Warmup forward pass
      tf.tidy(() => {
        this.blazeGaze.predict(dummyEyePatch, dummyHeadVector, dummyFaceOrigin3D);
      });

      // Warmup backward pass (gradient computation)
      const opt = tf.train.adam(1e-5, 0.85, 0.9, 1e-8);
      tf.tidy(() => {
        const { grads, value: loss } = tf.variableGrads(() => {
          const preds = this.blazeGaze.predict(dummyEyePatch, dummyHeadVector, dummyFaceOrigin3D);
          const loss = tf.losses.meanSquaredError(dummyTarget, preds);
          return loss.asScalar();
        });
        opt.applyGradients(grads as Record<string, tf.Variable>);
      });

      // Warmup affine matrix computation path (kicks in at iteration 4)
      if (iteration >= 4) {
        tf.tidy(() => {
          // Simulate multiple calibration points [batch, H=128, W=512, channels]
          const multiEyePatches = tf.randomUniform([iteration, 128, 512, 3], 0, 1);
          const multiHeadVectors = tf.randomUniform([iteration, 3], -1, 1);
          const multiFaceOrigins3D = tf.randomUniform([iteration, 3], -100, 100);

          const preds = this.blazeGaze.predict(multiEyePatches, multiHeadVectors, multiFaceOrigins3D);

          // Trigger affine transformation path
          if (this.affineMatrix) {
            applyAffineMatrix(this.affineMatrix, preds);
          }
        });
      }

      // Clean up iteration tensors
      opt.dispose();
      tf.dispose([dummyEyePatch, dummyHeadVector, dummyFaceOrigin3D, dummyTarget]);

      const iterationTime = performance.now() - iterationStart;
      console.log(`  Iteration ${iteration}/${numWarmupIterations}: ${iterationTime.toFixed(2)}ms`);
    }

    const warmupTime = performance.now() - warmupStart;
    console.log(`✅ TensorFlow.js warmup complete in ${warmupTime.toFixed(2)}ms`);
    console.log(`   GPU shaders compiled, computation graphs optimized`);
  }

  /**
   * Clears the calibration buffer and resets affine matrix.
   * Call this when starting a new calibration session (e.g., user clicks "Calibrate" button again).
   * Properly disposes all calibration tensors to prevent memory leaks.
   */
  clearCalibrationBuffer() {
    console.log('🔄 Clearing calibration buffer for re-calibration');

    // Dispose all calibration tensors
    this.calibData.calibSupportX.forEach(item => {
      tf.dispose([item.eyePatches, item.headVectors, item.faceOrigins3D]);
    });

    this.calibData.calibSupportY.forEach(tensor => {
      tf.dispose(tensor);
    });

    // Clear calibration arrays
    this.calibData.calibSupportX = [];
    this.calibData.calibSupportY = [];
    this.calibData.calibTimestamps = [];

    // Reset affine matrix (will be recomputed with new calibration)
    if (this.affineMatrix) {
      tf.dispose(this.affineMatrix);
      this.affineMatrix = null;
    }

    console.log('✅ Calibration buffer cleared');
  }

  /**
   * Clears the clickstream buffer while preserving calibration points.
   * Use this to remove stale clickstream data without affecting calibration.
   * Properly disposes all clickstream tensors to prevent memory leaks.
   *
   * @example
   * // Clear stale clicks while keeping calibration
   * tracker.clearClickstreamPoints();
   */
  clearClickstreamPoints() {
    console.log('🔄 Clearing clickstream buffer');

    // Dispose all clickstream tensors
    this.calibData.clickSupportX.forEach(item => {
      tf.dispose([item.eyePatches, item.headVectors, item.faceOrigins3D]);
    });

    this.calibData.clickSupportY.forEach(tensor => {
      tf.dispose(tensor);
    });

    // Clear clickstream arrays
    this.calibData.clickSupportX = [];
    this.calibData.clickSupportY = [];
    this.calibData.clickTimestamps = [];

    console.log('✅ Clickstream buffer cleared');
  }

  /**
   * Resets both calibration and clickstream buffers for a completely fresh start.
   * This is the recommended method to call when initiating re-calibration.
   * Properly disposes all tensors and resets affine matrix.
   *
   * @example
   * // User clicks "Recalibrate" button
   * tracker.resetAllBuffers();
   * tracker.adapt(...); // Start fresh calibration
   */
  resetAllBuffers() {
    console.log('🔄 Resetting all buffers for re-calibration');
    this.clearCalibrationBuffer();
    this.clearClickstreamPoints();
    console.log('✅ All buffers reset - ready for fresh calibration');
  }

  /**
   * Prunes the clickstream buffer based on TTL and maxClickPoints.
   * Calibration buffer is NEVER pruned - calibration points persist for the entire session.
   */
  pruneCalibData() {
    // === CALIBRATION BUFFER: No pruning ===
    // Calibration points are permanent and never evicted
    // Overflow is handled in adapt() method with user-visible error

    // === CLICKSTREAM BUFFER: TTL + FIFO pruning ===
    const currentTime = Date.now();
    const ttl = this.clickTTL * 1000;

    // Step 1: Remove expired click points (TTL pruning)
    const validIndices: number[] = [];
    const expiredIndices: number[] = [];

    this.calibData.clickTimestamps.forEach((timestamp, index) => {
      if (currentTime - timestamp <= ttl) {
        validIndices.push(index);
      } else {
        expiredIndices.push(index);
      }
    });

    // Dispose expired tensors
    expiredIndices.forEach(index => {
      const item = this.calibData.clickSupportX[index];
      tf.dispose([item.eyePatches, item.headVectors, item.faceOrigins3D]);
      tf.dispose(this.calibData.clickSupportY[index]);
    });

    // Filter to keep only non-expired clicks
    this.calibData.clickSupportX = validIndices.map(i => this.calibData.clickSupportX[i]);
    this.calibData.clickSupportY = validIndices.map(i => this.calibData.clickSupportY[i]);
    this.calibData.clickTimestamps = validIndices.map(i => this.calibData.clickTimestamps[i]);

    // Step 2: Apply FIFO if still over maxClickPoints
    if (this.calibData.clickSupportX.length > this.maxClickPoints) {
      // Calculate how many to remove
      const numToRemove = this.calibData.clickSupportX.length - this.maxClickPoints;

      // Dispose oldest click tensors
      const itemsToRemove = this.calibData.clickSupportX.slice(0, numToRemove);
      itemsToRemove.forEach(item => {
        tf.dispose([item.eyePatches, item.headVectors, item.faceOrigins3D]);
      });

      const tensorsToRemove = this.calibData.clickSupportY.slice(0, numToRemove);
      tensorsToRemove.forEach(tensor => {
        tf.dispose(tensor);
      });

      // Keep only last maxClickPoints
      this.calibData.clickSupportX = this.calibData.clickSupportX.slice(-this.maxClickPoints);
      this.calibData.clickSupportY = this.calibData.clickSupportY.slice(-this.maxClickPoints);
      this.calibData.clickTimestamps = this.calibData.clickTimestamps.slice(-this.maxClickPoints);
    }
  }

  handleClick(x: number, y: number) {
    console.log(`🖱️ Global click at: (${x}, ${y}), ${this.loaded}`);

    // Debounce clicks based on the latest click timestamp
    if (this.latestMouseClick && (Date.now() - this.latestMouseClick.timestamp < 1000)) {
      console.log("🖱️ Click ignored due to debounce");
      this.latestMouseClick = { x, y, timestamp: Date.now() };
      return;
    }

    // Avoid pts that are too close to the last click
    if (this.latestMouseClick && 
        Math.abs(x - this.latestMouseClick.x) < 0.05 && 
        Math.abs(y - this.latestMouseClick.y) < 0.05) {
      console.log("🖱️ Click ignored due to proximity to last click");
      this.latestMouseClick = { x, y, timestamp: Date.now() };
      return;
    }

    this.latestMouseClick = { x, y, timestamp: Date.now() };

    if (this.loaded && this.latestGazeResult) {
      // Adapt the model based on the click position
      // Use Python default parameters (main.py:183-185) for click calibration
      this.adapt(
        [this.latestGazeResult?.eyePatch as ImageData],
        [this.latestGazeResult?.headVector as number[]],
        [this.latestGazeResult?.faceOrigin3D as number[]],
        [[x, y]],
        10,      // stepsInner: matches Python main.py:183
        1e-4,    // innerLR: matches Python main.py:184
        'click'  // ptType: matches Python main.py:185
      );
    }
  }

  computeFaceOrigin3D(frame: ImageData, normFaceLandmarks: Point[], faceLandmarks: Point[], faceRT: Matrix): number[] {

    // Estimate the face width in centimeters if not set
    if (this.faceWidthComputed === false) {
      this.faceWidthCm = estimateFaceWidth(faceLandmarks);
      this.faceWidthComputed = true;
    }

    // Perform 3D face reconstruction and determine the pose in 3d cm space
    const [metricTransform, metricFace] = faceReconstruction(
      this.perspectiveMatrix,
      normFaceLandmarks as [number, number][],
      faceRT,
      this.intrinsicsMatrix,
      this.faceWidthCm,
      frame.width,
      frame.height,
      this.latestGazeResult?.faceOrigin3D?.[2] ?? 60
    );

    // Lastly, compute the gaze origins in 3D space using the metric face
    const faceOrigin3D = computeFaceOrigin3D(
      metricFace
    );

    // return faceOrigin3D;
    return faceOrigin3D;
  }

  prepareInput(frame: ImageData, result: FaceLandmarkerResult):  [ImageData, number[], number[]] {

    // Get the dimensions of the video frame
    const width = frame.width;
    const height = frame.height;

    // If perspective matrix is not set, initialize it
    if (!this.perspectiveMatrixSet) {
      const aspectRatio = width / height;
      this.perspectiveMatrix = createPerspectiveMatrix(aspectRatio);
      this.perspectiveMatrixSet = true;
    }

    // If intrinsics matrix is not set, initialize it
    if (!this.intrinsicsMatrixSet) {
      this.intrinsicsMatrix = createIntrinsicsMatrix(width, height);
    }

    // Convert the normalized landmarks to non-normalized coordinates
    const landmarks = result.faceLandmarks[0];
    const landmarks2d: Point[] = landmarks.map((landmark: NormalizedLandmark) => {
      return [
        Math.floor(landmark.x * width),
        Math.floor(landmark.y * height),
      ];
    });

    // Convert from MediaPipeMatrix to ml-matrix Matrix
    const faceRT = translateMatrix(result.facialTransformationMatrixes[0]);

    // First, extract the eye patch
    const eyePatch = obtainEyePatch(
      frame,
      landmarks2d,
    );

    // Second, compute the face origin in 3D space
    const face_origin_3d = this.computeFaceOrigin3D(
      frame,
      landmarks.map((l: NormalizedLandmark) => [l.x, l.y]),
      landmarks2d,
      faceRT
    )

    // Third, compute the head vector
    const head_vector = getHeadVector(
      faceRT
    );

    return [
      eyePatch,
      head_vector,
      face_origin_3d
    ];
  }

  adapt(
    eyePatches: ImageData[],
    headVectors: number[][],
    faceOrigins3D: number[][],
    normPogs: number[][],
    stepsInner: number = 5,    // Default: 5 (matches Python webeyetrack.py:324)
    innerLR: number = 1e-5,    // Default: 1e-5 (matches Python webeyetrack.py:325)
    ptType: 'calib' | 'click' = 'calib'
  ) {

    // Prune old clickstream data (calibration buffer is never pruned)
    this.pruneCalibData();

    // Optimizer must persist across training iterations, so created outside tf.tidy()
    // Must be explicitly disposed to prevent memory leak of internal variables
    const opt = tf.train.adam(innerLR, 0.85, 0.9, 1e-8);

    try {
      let { supportX, supportY } = generateSupport(
        eyePatches,
        headVectors,
        faceOrigins3D,
        normPogs
      );

      // === ROUTE TO APPROPRIATE BUFFER ===
      const batchSize = supportX.eyePatches.shape[0];  // Number of points in this batch

      if (ptType === 'calib') {
        // Calculate total calibration points after adding this batch
        const currentCalibPoints = this.calibData.calibSupportX.reduce((sum, s) => sum + s.eyePatches.shape[0], 0);
        const newTotal = currentCalibPoints + batchSize;

        // Check calibration buffer capacity
        if (newTotal > this.maxCalibPoints) {
          console.error(`❌ Calibration buffer full (${this.maxCalibPoints} points max).`);
          console.error(`   Current: ${currentCalibPoints} points, trying to add: ${batchSize} points`);
          console.error(`   Total would be: ${newTotal} points (exceeds limit by ${newTotal - this.maxCalibPoints})`);
          console.error(`   Hint: Call clearCalibrationBuffer() to start a new calibration session.`);

          // Dispose the new point's tensors since we can't store it
          tf.dispose([supportX.eyePatches, supportX.headVectors, supportX.faceOrigins3D, supportY]);

          // Don't proceed with training
          return;
        }

        // Add to calibration buffer
        this.calibData.calibSupportX.push(supportX);
        this.calibData.calibSupportY.push(supportY);
        this.calibData.calibTimestamps.push(Date.now());

        console.log(`✅ Added ${batchSize} calibration point(s) - Total: ${newTotal}/${this.maxCalibPoints} points in ${this.calibData.calibSupportX.length} batch(es)`);
      } else {
        // Add to clickstream buffer
        this.calibData.clickSupportX.push(supportX);
        this.calibData.clickSupportY.push(supportY);
        this.calibData.clickTimestamps.push(Date.now());

        // Count total click points across all batches
        const totalClickPoints = this.calibData.clickSupportX.reduce((sum, s) => sum + s.eyePatches.shape[0], 0);
        const totalCalibPoints = this.calibData.calibSupportX.reduce((sum, s) => sum + s.eyePatches.shape[0], 0);

        console.log(`✅ Added ${batchSize} click point(s) - Total: ${totalClickPoints} click points, ${totalCalibPoints} calib points`);
      }

      // === CONCATENATE FROM BOTH BUFFERS FOR TRAINING ===
      let tfEyePatches: tf.Tensor;
      let tfHeadVectors: tf.Tensor;
      let tfFaceOrigins3D: tf.Tensor;
      let tfSupportY: tf.Tensor;
      let needsDisposal: boolean; // Track if we created new tensors that need disposal

      const allSupportX = [...this.calibData.calibSupportX, ...this.calibData.clickSupportX];
      const allSupportY = [...this.calibData.calibSupportY, ...this.calibData.clickSupportY];

      if (allSupportX.length > 1) {
        // Create concatenated tensors from both buffers
        tfEyePatches = tf.concat(allSupportX.map(s => s.eyePatches), 0);
        tfHeadVectors = tf.concat(allSupportX.map(s => s.headVectors), 0);
        tfFaceOrigins3D = tf.concat(allSupportX.map(s => s.faceOrigins3D), 0);
        tfSupportY = tf.concat(allSupportY, 0);
        needsDisposal = true; // We created new concatenated tensors
      } else {
        // Only one point total, use it directly (no concatenation needed)
        tfEyePatches = supportX.eyePatches;
        tfHeadVectors = supportX.headVectors;
        tfFaceOrigins3D = supportX.faceOrigins3D;
        tfSupportY = supportY;
        needsDisposal = false; // These are references to buffer tensors, don't dispose
      }

      // === COMPUTE AFFINE TRANSFORMATION ===
      // Requires at least 4 points (affine has 6 DOF: 2 scale, 2 rotation/shear, 2 translation)
      if (tfEyePatches.shape[0] > 3) {
        const supportPreds = tf.tidy(() => {
          return this.blazeGaze.predict(
            tfEyePatches,
            tfHeadVectors,
            tfFaceOrigins3D
          );
        });

        const supportPredsNumber = supportPreds.arraySync() as number[][];
        const supportYNumber = tfSupportY.arraySync() as number[][];

        // Dispose the prediction tensor after extracting values
        tf.dispose(supportPreds);

        const affineMatrixML = computeAffineMatrixML(
          supportPredsNumber,
          supportYNumber
        );

        // Dispose old affine matrix before creating new one
        if (this.affineMatrix) {
          tf.dispose(this.affineMatrix);
        }
        this.affineMatrix = tf.tensor2d(affineMatrixML, [2, 3], 'float32');
      }

      // === MAML-STYLE ADAPTATION TRAINING ===
      tf.tidy(() => {
        for (let i = 0; i < stepsInner; i++) {
          const { grads, value: loss } = tf.variableGrads(() => {
            const preds = this.blazeGaze.predict(tfEyePatches, tfHeadVectors, tfFaceOrigins3D);
            const predsTransformed = this.affineMatrix ? applyAffineMatrix(this.affineMatrix, preds) : preds;
            const loss = tf.losses.meanSquaredError(tfSupportY, predsTransformed);
            return loss.asScalar();
          });

          // variableGrads returns NamedTensorMap where values are gradients of Variables
          // Type assertion is safe because variableGrads computes gradients w.r.t. Variables
          opt.applyGradients(grads as Record<string, tf.Variable>);

          // Explicitly dispose gradients (defensive, tf.tidy should handle this)
          Object.values(grads).forEach(g => g.dispose());

          // Synchronous logging to avoid race condition with tf.tidy() cleanup
          const lossValue = loss.dataSync()[0];
          console.log(`Loss = ${lossValue.toFixed(4)}`);
          loss.dispose();
        }
      });

      // === CLEANUP: Dispose concatenated tensors ===
      // Only dispose if we created new tensors via concatenation
      if (needsDisposal) {
        tf.dispose([tfEyePatches, tfHeadVectors, tfFaceOrigins3D, tfSupportY]);
      }
    } finally {
      // CRITICAL: Dispose optimizer to prevent memory leak
      // Optimizer creates internal variables (momentum buffers, variance accumulators)
      // that persist until explicitly disposed, causing ~1-5 MB leak per adapt() call
      opt.dispose();
    }
  }

  async step(frame: ImageData, timestamp: number): Promise<GazeResult> {
    const tic1 = performance.now();
    let result = await this.faceLandmarkerClient.processFrame(frame) as FaceLandmarkerResult | null;
    const tic2 = performance.now();
    // result = null; // For testing purposes, we can set result to null to simulate no face detected
    if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
      return {
        facialLandmarks: [],
        faceRt: {rows: 0, columns: 0, data: []}, // Placeholder for face transformation matrix
        faceBlendshapes: [],
        eyePatch: new ImageData(1, 1), // Placeholder for eye patch
        headVector: [0, 0, 0], // Placeholder for head vector
        faceOrigin3D: [0, 0, 0], // Placeholder for face
        metric_transform: {rows: 3, columns: 3, data: [1, 0, 0, 1, 0, 0, 1, 0, 0]}, // Placeholder for metric transform
        gazeState: 'closed', // Default to closed state if no landmarks
        normPog: [0, 0], // Placeholder for normalized point of gaze
        durations: {
          faceLandmarker: tic2 - tic1,
          prepareInput: 0,
          blazeGaze: 0,
          kalmanFilter: 0,
          total: 0
        },
        timestamp: timestamp // Include the timestamp
      };
    }

    // Perform preprocessing to obtain the eye patch, head_vector, and face_origin_3d
    const [eyePatch, headVector, faceOrigin3D] = this.prepareInput(frame, result);
    const tic3 = performance.now();

    // Compute the EAR ratio to determine if the eyes are open or closed
    let gaze_state: 'open' | 'closed' = 'open';
    const leftEAR = computeEAR(result.faceLandmarks[0], 'left');
    const rightEAR = computeEAR(result.faceLandmarks[0], 'right');
    if ( leftEAR < 0.2 || rightEAR < 0.2) {
      gaze_state = 'closed';
    }
    // gaze_state = 'closed';

    // If 'closed' return (0, 0) 
    if (gaze_state === 'closed') {
      return {
        facialLandmarks: result.faceLandmarks[0],
        faceRt: result.facialTransformationMatrixes[0],
        faceBlendshapes: result.faceBlendshapes,
        eyePatch: eyePatch,
        headVector: headVector,
        faceOrigin3D: faceOrigin3D,
        metric_transform: {rows: 3, columns: 3, data: [1, 0, 0, 1, 0, 0, 1, 0, 0]}, // Placeholder, should be computed
        gazeState: gaze_state,
        normPog: [0, 0],
        durations: {
          faceLandmarker: tic2 - tic1,
          prepareInput: tic3 - tic2,
          blazeGaze: 0, // No BlazeGaze inference if eyes are closed
          kalmanFilter: 0, // No Kalman filter step if eyes are closed
          total: tic3 - tic1
        },
        timestamp: timestamp // Include the timestamp
      };
    }

    const [predNormPog, tic4] = tf.tidy(() => {

      // Perform the gaze estimation via BlazeGaze Model (tensorflow.js)
      const inputTensor = tf.browser.fromPixels(eyePatch).toFloat().expandDims(0);

      // Divide the inputTensor by 255 to normalize pixel values
      const normalizedInputTensor = inputTensor.div(tf.scalar(255.0));
      const headVectorTensor = tf.tensor2d(headVector, [1, 3]);
      const faceOriginTensor = tf.tensor2d(faceOrigin3D, [1, 3]);
      let outputTensor = this.blazeGaze.predict(normalizedInputTensor, headVectorTensor, faceOriginTensor);
      tf.dispose([inputTensor, normalizedInputTensor, headVectorTensor, faceOriginTensor]);
      const tic4 = performance.now();

      // If affine transformation is available, apply it
      if (this.affineMatrix) {
        outputTensor = applyAffineMatrix(this.affineMatrix, outputTensor);
      }

      // Extract the 2D gaze point data from the output tensor
      if (!outputTensor || outputTensor.shape.length === 0) {
        throw new Error("BlazeGaze model did not return valid output");
      }
      return [outputTensor, tic4];
    });

    const normPog = predNormPog.arraySync() as number[][];
    tf.dispose(predNormPog);

    // Apply Kalman filter to smooth the gaze point
    const kalmanOutput = this.kalmanFilter.step(normPog[0]);
    const tic5 = performance.now();

    // Clip the output to the range of [-0.5, 0.5]
    kalmanOutput[0] = Math.max(-0.5, Math.min(0.5, kalmanOutput[0]));
    kalmanOutput[1] = Math.max(-0.5, Math.min(0.5, kalmanOutput[1]));

    // Log the timings
    const durations = {
      faceLandmarker: tic2 - tic1,
      prepareInput: tic3 - tic2,
      blazeGaze: tic4 - tic3,
      kalmanFilter: tic5 - tic4,
      total: tic5 - tic1
    };

    // Return GazeResult
    let gaze_result: GazeResult = {
      facialLandmarks: result.faceLandmarks[0],
      faceRt: result.facialTransformationMatrixes[0],
      faceBlendshapes: result.faceBlendshapes,
      eyePatch: eyePatch,
      headVector: headVector,
      faceOrigin3D: faceOrigin3D,
      metric_transform: {rows: 3, columns: 3, data: [1, 0, 0, 1, 0, 0, 1, 0, 0]}, // Placeholder, should be computed
      gazeState: gaze_state,
      normPog: kalmanOutput,
      durations: durations,
      timestamp: timestamp
    };

    // Debug: Printout the tf.Memory
    // console.log(`[WebEyeTrack] tf.Memory: ${JSON.stringify(tf.memory().numTensors)} tensors, ${JSON.stringify(tf.memory().unreliable)} unreliable, ${JSON.stringify(tf.memory().numBytes)} bytes`);

    // Update the latest gaze result
    this.latestGazeResult = gaze_result;
    return gaze_result;
  }

  /**
   * Disposes all TensorFlow.js tensors and resources held by this tracker.
   * After calling dispose(), this object should not be used.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }

    // Dispose all calibration buffer tensors
    this.calibData.calibSupportX.forEach(item => {
      tf.dispose([item.eyePatches, item.headVectors, item.faceOrigins3D]);
    });

    this.calibData.calibSupportY.forEach(tensor => {
      tf.dispose(tensor);
    });

    // Dispose all clickstream buffer tensors
    this.calibData.clickSupportX.forEach(item => {
      tf.dispose([item.eyePatches, item.headVectors, item.faceOrigins3D]);
    });

    this.calibData.clickSupportY.forEach(tensor => {
      tf.dispose(tensor);
    });

    // Clear all buffer arrays
    this.calibData.calibSupportX = [];
    this.calibData.calibSupportY = [];
    this.calibData.calibTimestamps = [];
    this.calibData.clickSupportX = [];
    this.calibData.clickSupportY = [];
    this.calibData.clickTimestamps = [];

    // Dispose affine matrix
    if (this.affineMatrix) {
      tf.dispose(this.affineMatrix);
      this.affineMatrix = null;
    }

    // Dispose child components if they have dispose methods
    if ('dispose' in this.blazeGaze && typeof this.blazeGaze.dispose === 'function') {
      this.blazeGaze.dispose();
    }

    if ('dispose' in this.faceLandmarkerClient && typeof this.faceLandmarkerClient.dispose === 'function') {
      this.faceLandmarkerClient.dispose();
    }

    this._disposed = true;
  }

  /**
   * Returns true if dispose() has been called on this tracker.
   */
  get isDisposed(): boolean {
    return this._disposed;
  }
}