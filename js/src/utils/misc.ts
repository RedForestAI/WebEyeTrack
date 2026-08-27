// Reused across calls so we're not allocating a new canvas + 2D context on
// every video frame (this runs once per animation frame on the main thread).
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

export function convertVideoFrameToImageData(frame: HTMLVideoElement): ImageData {
  if (!sharedCanvas || !sharedCtx) {
    sharedCanvas = document.createElement('canvas');
    sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  if (sharedCanvas.width !== frame.videoWidth || sharedCanvas.height !== frame.videoHeight) {
    sharedCanvas.width = frame.videoWidth;
    sharedCanvas.height = frame.videoHeight;
  }

  sharedCtx.drawImage(frame, 0, 0);

  // Extract ImageData from canvas
  const imageData = sharedCtx.getImageData(0, 0, sharedCanvas.width, sharedCanvas.height);
  return imageData;
}