/**
 * Type definitions for recording functionality
 */

import type { GazeResult } from 'webeyetrack';

/**
 * Raw gaze data point for kollaR-ts analysis
 */
export interface RawGazeData {
  timestamp: number;  // milliseconds
  x: number;          // pixels
  y: number;          // pixels
}

/**
 * Recording session metadata
 */
export interface RecordingMetadata {
  startTime: number;
  endTime?: number;
  duration?: number;
  sampleCount: number;
  screenWidth: number;
  screenHeight: number;
  oneDegree: number;
  screenPreset: string;
  recordingMode: 'screen';  // Always screen mode
}

/**
 * Complete recording session data
 */
export interface RecordingSession {
  metadata: RecordingMetadata;
  gazeData: RawGazeData[];
  videoBlob: Blob;
}

/**
 * Recording state
 */
export interface RecordingState {
  isRecording: boolean;
  duration: number;       // milliseconds
  sampleCount: number;
  videoSize: number;      // bytes (estimate)
}
