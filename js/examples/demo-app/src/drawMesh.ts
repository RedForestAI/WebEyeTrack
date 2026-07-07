import { GazeResult } from 'webeyetrack';
import { FaceLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

export function drawMesh(gaze_result: GazeResult, canvas: HTMLCanvasElement) {

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error("Failed to get canvas context");
    return;
  }

  const drawingUtils = new DrawingUtils(ctx);
  const landmarks = gaze_result.facialLandmarks

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (drawingUtils) {
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_TESSELATION,
      { color: "#C0C0C070", lineWidth: 0.5 }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
      { color: "#FF3030" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
      { color: "#30FF30" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
      { color: "#E0E0E0" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_LIPS,
      { color: "#E0E0E0" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
      { color: "#FF3030" }
    );
    drawingUtils.drawConnectors(
      landmarks,
      FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
      { color: "#30FF30" }
    );
  }

}