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
      await tracker.initialize(payload?.baseUrl);
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

      await tracker.handleClick(payload.x, payload.y);

      status = 'idle';
      self.postMessage({ type: 'statusUpdate', status: status});
      break;

    default:
      console.warn(`[WebEyeTrackWorker] Unknown message type: ${type}`);
      break;
  }
};

export {}; // for TS module mode
