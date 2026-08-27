import WebcamClient from "./WebcamClient";
import { GazeResult } from "./types";

// @ts-ignore
import WebEyeTrackWorker from "worker-loader?inline=no-fallback!./WebEyeTrackWorker.ts";
export default class WebEyeTrackProxy {
  private worker: Worker;

  public status: 'idle' | 'inference' | 'calib' = 'idle';

  constructor(webcamClient: WebcamClient) {

    // Initialize the WebEyeTrackWorker
    this.worker = new WebEyeTrackWorker();
    console.log('WebEyeTrackProxy worker initialized');

    this.worker.onmessage = (mess) =>{
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

        default:
          console.warn(`[WebEyeTrackProxy] Unknown message type: ${mess.data.type}`);
          break;
      }
    }

    // Initialize the worker, passing along the page's base URL so the
    // BlazeGaze model is fetched relative to the app's deployment path
    // (e.g. GitHub Pages project sites served from a subpath) rather than
    // always assuming the domain root.
    const baseUrl = new URL('.', document.baseURI).toString();
    this.worker.postMessage({ type: 'init', payload: { baseUrl } });

    // Add mouse handler for re-calibration
    window.addEventListener('click', (e: MouseEvent) => {
      // Convert px to normalized coordinates
      const normX = (e.clientX / window.innerWidth) - 0.5;
      const normY = (e.clientY / window.innerHeight) - 0.5;
      console.log(`[WebEyeTrackProxy] Click at (${normX}, ${normY})`);
      this.worker.postMessage({ type: 'click', payload: { x: normX, y: normY }});
    })
  }

  // Callback for gaze results
  onGazeResults: (gazeResult: GazeResult) => void = () => { 
    console.warn('onGazeResults callback not set');
  }
}
