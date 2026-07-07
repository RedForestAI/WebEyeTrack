import WebEyeTrack from './WebEyeTrack';

let tracker: WebEyeTrack;

const ctx: Worker = self as any;
let status: 'idle' | 'inference' | 'calib' = 'idle';
let lastTimestamp: number | null = null;

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'init':
      tracker = new WebEyeTrack();
      await tracker.initialize(payload?.modelPath);
      self.postMessage({ type: 'ready' });
      status = 'idle';
      break;

    case 'step':
      if (status === 'idle') {

        status = 'inference';
        self.postMessage({ type: 'statusUpdate', status: status});

        const result = await tracker.step(payload.frame as ImageData, payload.timestamp);
        lastTimestamp = payload.timestamp;
        self.postMessage({ type: 'stepResult', result });

        status = 'idle';
        self.postMessage({ type: 'statusUpdate', status: status});
      }
      break;

    case 'click':
      // Handle click event for re-calibration
      status = 'calib';
      self.postMessage({ type: 'statusUpdate', status: status});

      tracker.handleClick(payload.x, payload.y);

      status = 'idle';
      self.postMessage({ type: 'statusUpdate', status: status});
      break;

    case 'adapt':
      // Handle manual calibration adaptation
      status = 'calib';
      self.postMessage({ type: 'statusUpdate', status: status});

      try {
        tracker.adapt(
          payload.eyePatches,
          payload.headVectors,
          payload.faceOrigins3D,
          payload.normPogs,
          payload.stepsInner,
          payload.innerLR,
          payload.ptType
        );
        self.postMessage({ type: 'adaptComplete', success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Adaptation failed';
        self.postMessage({ type: 'adaptComplete', success: false, error: errorMessage });
      }

      status = 'idle';
      self.postMessage({ type: 'statusUpdate', status: status});
      break;

    case 'clearCalibration':
      // Clear calibration buffer for re-calibration
      if (tracker) {
        tracker.clearCalibrationBuffer();
      }
      break;

    case 'clearClickstream':
      // Clear clickstream buffer while preserving calibration
      if (tracker) {
        tracker.clearClickstreamPoints();
      }
      break;

    case 'resetAllBuffers':
      // Reset both calibration and clickstream buffers
      if (tracker) {
        tracker.resetAllBuffers();
      }
      break;

    case 'dispose':
      // Clean up tracker resources before worker termination
      if (tracker) {
        tracker.dispose();
      }
      break;

    default:
      console.warn(`[WebEyeTrackWorker] Unknown message type: ${type}`);
      break;
  }
};

export {}; // for TS module mode
