/**
 * Fixation Detection Web Worker
 *
 * Runs I-VT and I-DT algorithms in a background thread to prevent
 * blocking the main UI thread during real-time processing.
 *
 * This worker receives gaze data buffers from the main thread and
 * returns fixation results asynchronously.
 */

/* eslint-disable no-restricted-globals */
// 'self' is the correct global in Web Worker context

import { preprocessGaze, algorithmIVT, algorithmIDT } from 'kollar-ts';

/**
 * Message types for worker communication
 */
export type WorkerMessageType = 'process' | 'reset';

export interface RawGazeData {
  timestamp: number;
  x: number;
  y: number;
}

export interface RealtimeFixation {
  algorithm: 'ivt' | 'idt';
  x: number;
  y: number;
  duration: number;
  timestamp: number;
}

export interface WorkerInputMessage {
  type: WorkerMessageType;
  buffer?: RawGazeData[];
  enableIVT?: boolean;
  enableIDT?: boolean;
  oneDegree?: number;
}

export interface WorkerOutputMessage {
  type: 'result' | 'error' | 'ready';
  fixationIVT?: RealtimeFixation | null;
  fixationIDT?: RealtimeFixation | null;
  error?: string;
}

const MIN_SAMPLES_FOR_DETECTION = 60;

/**
 * Process buffer with I-VT algorithm
 */
function processIVT(buffer: RawGazeData[], oneDegree: number): RealtimeFixation | null {
  try {
    // Calculate sampling rate from buffer
    const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
    const samplingRate = buffer.length / (bufferDuration / 1000); // Hz

    // Adaptive smoothing - use smaller window for low sample rates
    const filterMs = samplingRate > 50 ? 15 : Math.max(5, Math.floor(1000 / samplingRate));

    const processed = preprocessGaze(buffer, {
      maxGapMs: 75,
      marginMs: 5,
      filterMs, // Adaptive smoothing window
    });

    const result = algorithmIVT(processed, {
      velocityThreshold: 30, // degrees/second
      minFixationDuration: 100, // ms
      minSaccadeDuration: 20,
      minSaccadeAmplitude: 0.5,
      oneDegree,
      saveVelocityProfiles: false,
    });

    // Get the most recent fixation
    if (result.fixations.length > 0) {
      const latestFixation = result.fixations[result.fixations.length - 1];

      // Check if this fixation is still ongoing (includes current time)
      const fixationEndTime = latestFixation.onset + latestFixation.duration;
      const currentTime = buffer[buffer.length - 1].timestamp;

      if (fixationEndTime >= currentTime - 100) {
        return {
          algorithm: 'ivt',
          x: latestFixation.x,
          y: latestFixation.y,
          duration: latestFixation.duration,
          timestamp: latestFixation.onset,
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('I-VT processing error in worker:', error);
    return null;
  }
}

/**
 * Process buffer with I-DT algorithm
 */
function processIDT(buffer: RawGazeData[], oneDegree: number): RealtimeFixation | null {
  try {
    // Calculate sampling rate from buffer
    const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
    const samplingRate = buffer.length / (bufferDuration / 1000); // Hz

    // Adaptive smoothing - use smaller window for low sample rates
    const filterMs = samplingRate > 50 ? 15 : Math.max(5, Math.floor(1000 / samplingRate));

    const processed = preprocessGaze(buffer, {
      maxGapMs: 75,
      marginMs: 5,
      filterMs, // Adaptive smoothing window
    });

    const result = algorithmIDT(processed, {
      dispersionThreshold: 1.0, // degrees
      minDuration: 100, // ms
      oneDegree,
    });

    // Get the most recent fixation
    if (result.fixations.length > 0) {
      const latestFixation = result.fixations[result.fixations.length - 1];

      // Check if this fixation is still ongoing
      const fixationEndTime = latestFixation.onset + latestFixation.duration;
      const currentTime = buffer[buffer.length - 1].timestamp;

      if (fixationEndTime >= currentTime - 100) {
        return {
          algorithm: 'idt',
          x: latestFixation.x,
          y: latestFixation.y,
          duration: latestFixation.duration,
          timestamp: latestFixation.onset,
        };
      }
    }

    return null;
  } catch (error) {
    console.warn('I-DT processing error in worker:', error);
    return null;
  }
}

/**
 * Main message handler
 */
self.onmessage = (event: MessageEvent<WorkerInputMessage>) => {
  const { type, buffer, enableIVT, enableIDT, oneDegree } = event.data;

  try {
    switch (type) {
      case 'process': {
        if (!buffer || buffer.length < MIN_SAMPLES_FOR_DETECTION) {
          // Not enough data - send null results
          const response: WorkerOutputMessage = {
            type: 'result',
            fixationIVT: null,
            fixationIDT: null,
          };
          self.postMessage(response);
          return;
        }

        // Validate buffer duration (defensive check)
        const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
        if (bufferDuration < 100) {
          // Suspicious buffer - skip processing
          const response: WorkerOutputMessage = {
            type: 'result',
            fixationIVT: null,
            fixationIDT: null,
          };
          self.postMessage(response);
          return;
        }

        // Process algorithms in parallel (non-blocking in worker thread)
        const fixationIVT = enableIVT ? processIVT(buffer, oneDegree || 40) : null;
        const fixationIDT = enableIDT ? processIDT(buffer, oneDegree || 40) : null;

        // Send results back to main thread
        const response: WorkerOutputMessage = {
          type: 'result',
          fixationIVT,
          fixationIDT,
        };
        self.postMessage(response);
        break;
      }

      case 'reset': {
        // Reset state (nothing to do in stateless worker)
        const response: WorkerOutputMessage = {
          type: 'ready',
        };
        self.postMessage(response);
        break;
      }

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    // Send error back to main thread
    const response: WorkerOutputMessage = {
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};

// Signal that worker is ready
const readyMessage: WorkerOutputMessage = {
  type: 'ready',
};
self.postMessage(readyMessage);
