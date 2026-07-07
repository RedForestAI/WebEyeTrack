import { FaceLandmarker, FilesetResolver, DrawingUtils, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { IDisposable } from './IDisposable';

// References
// https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js#video
export default class FaceLandmarkerClient implements IDisposable {
  private faceLandmarker: FaceLandmarker | null = null;
  private _disposed: boolean = false;

  constructor() {
  }

  async initialize() {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: "IMAGE",
      numFaces: 1,
    });
  }

  async processFrame(frame: ImageData): Promise<FaceLandmarkerResult | null> {
    if (!this.faceLandmarker) {
      console.error("FaceLandmarker is not loaded yet.");
      return null;
    }

    let result: FaceLandmarkerResult;
    result = await this.faceLandmarker.detect(frame);
    return result;
  }

  /**
   * Disposes the MediaPipe FaceLandmarker and releases resources.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }

    if (this.faceLandmarker) {
      // MediaPipe tasks have a close() method to release resources
      if ('close' in this.faceLandmarker && typeof this.faceLandmarker.close === 'function') {
        this.faceLandmarker.close();
      }
      this.faceLandmarker = null;
    }

    this._disposed = true;
  }

  /**
   * Returns true if dispose() has been called.
   */
  get isDisposed(): boolean {
    return this._disposed;
  }
}
