/**
 * Type definitions for WebEyeTrack calibration system
 * Matches Python implementation at python/demo/calibration_widget.py
 */

import { GazeResult } from 'webeyetrack';

/**
 * Normalized calibration point position
 * Range: [-0.5, 0.5] for both x and y
 * Origin (0, 0) is at screen center
 */
export interface CalibrationPoint {
  x: number;
  y: number;
}

/**
 * Sample collected during calibration at a specific calibration point
 */
export interface CalibrationSample {
  gazeResult: GazeResult;
  groundTruth: CalibrationPoint;
  timestamp: number;
}

/**
 * Collection of samples for a single calibration point
 */
export interface CalibrationPointData {
  position: CalibrationPoint;
  samples: CalibrationSample[];
  filteredSample?: CalibrationSample;  // Best sample after statistical filtering
}

/**
 * Calibration configuration matching Python's CalibConfig
 */
export interface CalibrationConfig {
  /** Number of calibration points (default: 4) */
  numPoints?: number;

  /** Target number of samples to collect per point (default: 25) */
  samplesPerPoint?: number;

  /** Duration in ms for color animation (default: 2000) */
  animationDuration?: number;

  /** Duration in ms to collect samples after animation (default: 1500) */
  collectionDuration?: number;

  /**
   * Inner loop steps for MAML adaptation (default: 10, matching Python)
   * Reference: python/demo/main.py:250
   * More steps = better convergence but slightly longer calibration time
   */
  stepsInner?: number;

  /**
   * Learning rate for adaptation (default: 1e-4, matching Python)
   * Reference: python/demo/main.py:251
   * Higher LR = faster convergence, must be balanced with stepsInner
   */
  innerLR?: number;
}

/**
 * Calibration status and progress
 */
export type CalibrationStatus =
  | 'idle'
  | 'instructions'
  | 'collecting'
  | 'processing'
  | 'complete'
  | 'error';

/**
 * Calibration state
 */
export interface CalibrationState {
  status: CalibrationStatus;
  currentPointIndex: number;
  totalPoints: number;
  pointsData: CalibrationPointData[];
  error?: string;
}

/**
 * 4-point calibration grid positions (matching Python)
 * Reference: python/demo/calibration_widget.py:20-25
 */
export const DEFAULT_CALIBRATION_POSITIONS: CalibrationPoint[] = [
  { x: -0.4, y: -0.4 },  // Top-left
  { x: 0.4, y: -0.4 },   // Top-right
  { x: -0.4, y: 0.4 },   // Bottom-left
  { x: 0.4, y: 0.4 },    // Bottom-right
];

/**
 * Default calibration configuration
 * Parameters match Python reference implementation (python/demo/main.py:246-252)
 */
export const DEFAULT_CALIBRATION_CONFIG: Required<CalibrationConfig> = {
  numPoints: 4,
  samplesPerPoint: 25,
  animationDuration: 2000,
  collectionDuration: 1500,
  stepsInner: 10,     // Match Python main.py:250 (NOT the JS default of 1)
  innerLR: 1e-4,      // Match Python main.py:251
};
