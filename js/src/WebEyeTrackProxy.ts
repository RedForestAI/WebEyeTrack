import WebcamClient from "./WebcamClient";
import { GazeResult } from "./types";
import { IDisposable } from "./IDisposable";
import { createWebEyeTrackWorker, WorkerConfig } from "./WorkerFactory";

export default class WebEyeTrackProxy implements IDisposable {
  private worker: Worker;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private _disposed: boolean = false;
  private adaptResolve: (() => void) | null = null;
  private adaptReject: ((error: Error) => void) | null = null;

  public status: 'idle' | 'inference' | 'calib' = 'idle';

  constructor(webcamClient: WebcamClient, workerConfig?: WorkerConfig) {

    // Initialize the WebEyeTrackWorker using the factory
    this.worker = createWebEyeTrackWorker(workerConfig);
    console.log('WebEyeTrackProxy worker initialized');

    // Store message handler reference for cleanup
    this.messageHandler = (mess) =>{
      // console.log(`[WebEyeTrackWorker] ${mess.data}`)
      // console.log('[WebEyeTrackProxy] received message', mess);

      // Switch state based on message type
      switch (mess.data.type) {
        case 'ready':
          console.log('[WebEyeTrackProxy] Worker is ready');

          // Start the webcam client and set up the frame callback
          webcamClient.startWebcam(async (frame: ImageData, timestamp: number) => {
            // Send the frame to the worker for processing
            if (this.status === 'idle') {
              this.worker.postMessage({
                type: 'step',
                payload: { frame, timestamp }
              })
            }
          });
          break;

        case 'stepResult':
          // Handle gaze results
          const gazeResult: GazeResult = mess.data.result;
          this.onGazeResults(gazeResult);
          break;

        case 'statusUpdate':
          this.status = mess.data.status;
          break;

        case 'adaptComplete':
          // Handle adaptation completion
          if (mess.data.success) {
            console.log('[WebEyeTrackProxy] Adaptation completed successfully');
          } else {
            console.error('[WebEyeTrackProxy] Adaptation failed:', mess.data.error);
          }
          // Resolve promise if we stored it
          if (this.adaptResolve && this.adaptReject) {
            if (mess.data.success) {
              this.adaptResolve();
            } else {
              this.adaptReject(new Error(mess.data.error));
            }
            this.adaptResolve = null;
            this.adaptReject = null;
          }
          break;

        default:
          console.warn(`[WebEyeTrackProxy] Unknown message type: ${mess.data.type}`);
          break;
      }
    };

    this.worker.onmessage = this.messageHandler;

    // Initialize the worker with optional modelPath
    this.worker.postMessage({ type: 'init', payload: { modelPath: workerConfig?.modelPath } });

    // Store click handler reference for cleanup
    this.clickHandler = (e: MouseEvent) => {
      // Convert px to normalized coordinates
      const normX = (e.clientX / window.innerWidth) - 0.5;
      const normY = (e.clientY / window.innerHeight) - 0.5;
      console.log(`[WebEyeTrackProxy] Click at (${normX}, ${normY})`);
      this.worker.postMessage({ type: 'click', payload: { x: normX, y: normY }});
    };

    // Add mouse handler for re-calibration
    window.addEventListener('click', this.clickHandler);
  }

  // Callback for gaze results
  onGazeResults: (gazeResult: GazeResult) => void = () => {
    console.warn('onGazeResults callback not set');
  }

  /**
   * Perform calibration adaptation
   * Sends calibration data to the worker for model fine-tuning
   *
   * @param eyePatches - Array of eye region images
   * @param headVectors - Array of 3D head direction vectors
   * @param faceOrigins3D - Array of 3D face positions
   * @param normPogs - Ground truth gaze points in normalized coords [-0.5, 0.5]
   * @param stepsInner - Number of gradient descent iterations (default: 1)
   * @param innerLR - Learning rate for adaptation (default: 1e-5)
   * @param ptType - Point type: 'calib' for manual, 'click' for automatic
   * @returns Promise that resolves when adaptation completes
   */
  async adapt(
    eyePatches: ImageData[],
    headVectors: number[][],
    faceOrigins3D: number[][],
    normPogs: number[][],
    stepsInner: number = 1,
    innerLR: number = 1e-5,
    ptType: 'calib' | 'click' = 'calib'
  ): Promise<void> {
    console.log('[WebEyeTrackProxy] Starting adaptation with', normPogs.length, 'points');

    return new Promise((resolve, reject) => {
      this.adaptResolve = resolve;
      this.adaptReject = reject;

      this.worker.postMessage({
        type: 'adapt',
        payload: {
          eyePatches,
          headVectors,
          faceOrigins3D,
          normPogs,
          stepsInner,
          innerLR,
          ptType
        }
      });
    });
  }

  /**
   * Clears the calibration buffer and resets the affine transformation matrix.
   * Call this when starting a new calibration session (e.g., user clicks "Calibrate" button again).
   * This ensures old calibration data doesn't interfere with the new calibration.
   */
  clearCalibrationBuffer(): void {
    console.log('[WebEyeTrackProxy] Clearing calibration buffer');
    this.worker.postMessage({ type: 'clearCalibration' });
  }

  /**
   * Clears the clickstream buffer while preserving calibration points.
   * Use this to remove stale clickstream data without affecting calibration.
   *
   * @example
   * // Clear stale clicks while keeping calibration
   * tracker.clearClickstreamPoints();
   */
  clearClickstreamPoints(): void {
    console.log('[WebEyeTrackProxy] Clearing clickstream buffer');
    this.worker.postMessage({ type: 'clearClickstream' });
  }

  /**
   * Resets both calibration and clickstream buffers for a completely fresh start.
   * This is the recommended method to call when initiating re-calibration.
   *
   * @example
   * // User clicks "Recalibrate" button
   * tracker.resetAllBuffers();
   * // Then start new calibration
   * await tracker.adapt(...);
   */
  resetAllBuffers(): void {
    console.log('[WebEyeTrackProxy] Resetting all buffers');
    this.worker.postMessage({ type: 'resetAllBuffers' });
  }

  /**
   * Disposes the proxy, terminating the worker and removing all event listeners.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }

    // Remove window click listener
    if (this.clickHandler) {
      window.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }

    // Remove message handler
    if (this.messageHandler) {
      this.worker.onmessage = null;
      this.messageHandler = null;
    }

    // Send disposal message to worker before terminating
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' });
      this.worker.terminate();
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
