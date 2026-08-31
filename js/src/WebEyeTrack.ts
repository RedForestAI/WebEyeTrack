import { FaceLandmarkerResult, NormalizedLandmark, Matrix as MediaPipeMatrix } from "@mediapipe/tasks-vision";
import * as tf from '@tensorflow/tfjs';
import { Matrix } from 'ml-matrix';

import { Point, GazeResult } from "./types";
import BlazeGaze from "./BlazeGaze";
import FaceLandmarkerClient from "./FaceLandmarkerClient";
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

export default class WebEyeTrack {
  
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

  // Public variables
  public loaded: boolean = false;
  public latestMouseClick: { x: number, y: number, timestamp: number } | null = null;
  public latestGazeResult: GazeResult | null = null;
  public calibData: {
    supportX: SupportX[],
    supportY: tf.Tensor[],
    timestamps: number[],
    ptType: ('calib' | 'click')[]
  } = {
    supportX: [],
    supportY: [],
    timestamps: [],
    ptType: ['calib']
  };

  // Configuration
  public maxPoints: number = 5;
  public clickTTL: number = 60; // Time-to-live for click points in seconds

  constructor(
      maxPoints: number = 5,
      clickTTL: number = 60 // Time-to-live for click points in seconds
    ) {

    // Initialize services
    this.blazeGaze = new BlazeGaze();
    this.faceLandmarkerClient = new FaceLandmarkerClient();
    this.kalmanFilter = new KalmanFilter2D();
    
    // Storing configs
    this.maxPoints = maxPoints;
    this.clickTTL = clickTTL;
  }

  async initialize(baseUrl?: string): Promise<void> {
    await this.faceLandmarkerClient.initialize();
    await this.blazeGaze.loadModel(baseUrl);
    this.loaded = true;
  }

  pruneCalibData() {
    
    // Prune the calibration data to keep only the last maxPoints points
    tf.tidy(() => {
      if (this.calibData.supportX.length > this.maxPoints) {
        this.calibData.supportX = this.calibData.supportX.slice(-this.maxPoints);
        this.calibData.supportY = this.calibData.supportY.slice(-this.maxPoints);
        this.calibData.timestamps = this.calibData.timestamps.slice(-this.maxPoints);
        this.calibData.ptType = this.calibData.ptType.slice(-this.maxPoints);
      }

      // Apply time-to-live pruning for 'click' points
      const currentTime = Date.now();
      const ttl = this.clickTTL * 1000; // Convert seconds to milliseconds

      // Filter all together
      const filteredIndices = this.calibData.timestamps.map((timestamp, index) => {
        return (currentTime - timestamp <= ttl || this.calibData.ptType[index] !== 'click') ? index : -1;
      }).filter(index => index !== -1);
      this.calibData.supportX = filteredIndices.map(index => this.calibData.supportX[index]);
      this.calibData.supportY = filteredIndices.map(index => this.calibData.supportY[index]);
      this.calibData.timestamps = filteredIndices.map(index => this.calibData.timestamps[index]);
      this.calibData.ptType = filteredIndices.map(index => this.calibData.ptType[index]);
    })
  }

  async handleClick(x: number, y: number): Promise<void> {
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
      await this.adapt(
        [this.latestGazeResult?.eyePatch as ImageData],
        [this.latestGazeResult?.headVector as number[]],
        [this.latestGazeResult?.faceOrigin3D as number[]],
        [[x, y]]
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

  async adapt(
    eyePatches: ImageData[],
    headVectors: number[][],
    faceOrigins3D: number[][],
    normPogs: number[][],
    stepsInner: number = 1,
    innerLR: number = 1e-5,
    ptType: 'calib' | 'click' = 'calib'
  ): Promise<void> {

    // Prune old calibration data
    this.pruneCalibData();

    // Prepare the inputs
    const opt = tf.train.adam(innerLR, 0.85, 0.9, 1e-8);
    let { supportX, supportY } = generateSupport(
      eyePatches,
      headVectors,
      faceOrigins3D,
      normPogs
    );

    // Append the new support data to the calibration data
    this.calibData.supportX.push(supportX);
    this.calibData.supportY.push(supportY);
    this.calibData.timestamps.push(Date.now());
    this.calibData.ptType.push(ptType);

    // Now extend the supportX and supportY tensors with prior calib data
    let tfEyePatches: tf.Tensor;
    let tfHeadVectors: tf.Tensor;
    let tfFaceOrigins3D: tf.Tensor;
    let tfSupportY: tf.Tensor;
    if (this.calibData.supportX.length > 1) {
      tfEyePatches = tf.concat(this.calibData.supportX.map(s => s.eyePatches), 0);
      tfHeadVectors = tf.concat(this.calibData.supportX.map(s => s.headVectors), 0);
      tfFaceOrigins3D = tf.concat(this.calibData.supportX.map(s => s.faceOrigins3D), 0);
      tfSupportY = tf.concat(this.calibData.supportY, 0);
    } else {
      // If there is no prior calibration data, we use the current supportX and supportY
      tfEyePatches = supportX.eyePatches;
      tfHeadVectors = supportX.headVectors;
      tfFaceOrigins3D = supportX.faceOrigins3D;
      tfSupportY = supportY;
    }

    // Perform a single forward pass to compute an affine transformation.
    // Uses the async .array() (not .arraySync()) so reading the tensors back
    // from the GPU doesn't force a synchronous stall — .arraySync() blocks
    // until the GPU finishes and flushes its command queue, which can jank
    // rendering elsewhere on the page even though this runs in a worker.
    if (tfEyePatches.shape[0] > 3) {
      const supportPreds = tf.tidy(() => {
        return this.blazeGaze.predict(
          tfEyePatches,
          tfHeadVectors,
          tfFaceOrigins3D
        );
      })
      const [supportPredsNumber, supportYNumber] = await Promise.all([
        supportPreds.array() as Promise<number[][]>,
        tfSupportY.array() as Promise<number[][]>
      ]);
      tf.dispose(supportPreds);
      const affineMatrixML = computeAffineMatrixML(
        supportPredsNumber,
        supportYNumber
      )
      if (this.affineMatrix) {
        tf.dispose(this.affineMatrix);
      }
      this.affineMatrix = tf.tensor2d(affineMatrixML, [2, 3], 'float32');
    }

    tf.tidy(() => {
      for (let i = 0; i < stepsInner; i++) {
        const { grads, value: loss } = tf.variableGrads(() => {
          const preds = this.blazeGaze.predict(tfEyePatches, tfHeadVectors, tfFaceOrigins3D);
          const predsTransformed = this.affineMatrix ? applyAffineMatrix(this.affineMatrix, preds) : preds;
          const loss = tf.losses.meanSquaredError(tfSupportY, predsTransformed);
          return loss.asScalar();
        });

        // Apply grads manually
        // @ts-ignore
        opt.applyGradients(grads);

        // Optionally log
        loss.data().then(val => console.log(`Loss = ${val[0].toFixed(4)}`));
      }
    });
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
}