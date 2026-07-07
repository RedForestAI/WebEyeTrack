/**
 * Calibration utility functions
 * Implements statistical filtering and coordinate conversion
 * Reference: Python implementation at python/demo/main.py:217-238
 */

import { CalibrationSample, CalibrationPoint } from '../types/calibration';

/**
 * Compute Euclidean distance between two points
 */
function distance(p1: CalibrationPoint, p2: CalibrationPoint): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Compute standard deviation of an array of numbers
 */
function std(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squaredDiffs));
}

/**
 * Filter calibration samples using statistical method (matching Python)
 *
 * Reference: python/demo/main.py:217-238
 * Algorithm:
 * 1. Extract all predicted gaze points from samples
 * 2. Compute mean gaze point across all samples
 * 3. Compute standard deviation
 * 4. Select the sample whose prediction is closest to the mean
 * 5. This removes outliers and selects the most representative sample
 *
 * @param samples - Array of calibration samples for a single calibration point
 * @returns The best sample (closest to mean prediction)
 */
export function filterSamples(samples: CalibrationSample[]): CalibrationSample | null {
  if (samples.length === 0) {
    console.warn('No samples to filter');
    return null;
  }

  if (samples.length === 1) {
    return samples[0];
  }

  // Extract predicted gaze points from all samples
  const predictions: CalibrationPoint[] = samples.map(sample => ({
    x: sample.gazeResult.normPog[0],
    y: sample.gazeResult.normPog[1]
  }));

  // Compute mean of predictions
  const meanX = mean(predictions.map(p => p.x));
  const meanY = mean(predictions.map(p => p.y));
  const meanPoint: CalibrationPoint = { x: meanX, y: meanY };

  // Compute standard deviation (for logging/debugging)
  const stdX = std(predictions.map(p => p.x));
  const stdY = std(predictions.map(p => p.y));

  console.log(`Filtering ${samples.length} samples: mean=(${meanX.toFixed(3)}, ${meanY.toFixed(3)}), std=(${stdX.toFixed(3)}, ${stdY.toFixed(3)})`);

  // Find sample with prediction closest to mean
  let closestSample = samples[0];
  let minDistance = distance(predictions[0], meanPoint);

  for (let i = 1; i < samples.length; i++) {
    const dist = distance(predictions[i], meanPoint);
    if (dist < minDistance) {
      minDistance = dist;
      closestSample = samples[i];
    }
  }

  console.log(`Selected sample with distance ${minDistance.toFixed(3)} from mean`);

  return closestSample;
}

/**
 * Convert normalized coordinates [-0.5, 0.5] to pixel coordinates
 *
 * @param normalized - Normalized point (origin at screen center)
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @returns Pixel coordinates (origin at top-left)
 */
export function normalizedToPixels(
  normalized: CalibrationPoint,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  return {
    x: (normalized.x + 0.5) * screenWidth,
    y: (normalized.y + 0.5) * screenHeight
  };
}

/**
 * Convert pixel coordinates to normalized coordinates [-0.5, 0.5]
 *
 * @param x - X coordinate in pixels
 * @param y - Y coordinate in pixels
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @returns Normalized point (origin at screen center)
 */
export function pixelsToNormalized(
  x: number,
  y: number,
  screenWidth: number,
  screenHeight: number
): CalibrationPoint {
  return {
    x: x / screenWidth - 0.5,
    y: y / screenHeight - 0.5
  };
}

/**
 * Validate that a calibration point is within valid normalized range
 */
export function isValidNormalizedPoint(point: CalibrationPoint): boolean {
  return (
    point.x >= -0.5 && point.x <= 0.5 &&
    point.y >= -0.5 && point.y <= 0.5
  );
}

/**
 * Extract calibration data for adapter.adapt() call
 *
 * @param filteredSamples - Array of filtered samples (one per calibration point)
 * @returns Data ready for tracker.adapt() method
 */
export function prepareAdaptationData(filteredSamples: CalibrationSample[]): {
  eyePatches: ImageData[];
  headVectors: number[][];
  faceOrigins3D: number[][];
  normPogs: number[][];
} {
  const eyePatches: ImageData[] = [];
  const headVectors: number[][] = [];
  const faceOrigins3D: number[][] = [];
  const normPogs: number[][] = [];

  for (const sample of filteredSamples) {
    const { gazeResult, groundTruth } = sample;

    // Extract data from GazeResult
    eyePatches.push(gazeResult.eyePatch);
    headVectors.push(gazeResult.headVector);
    faceOrigins3D.push(gazeResult.faceOrigin3D);

    // Ground truth calibration point
    normPogs.push([groundTruth.x, groundTruth.y]);
  }

  return { eyePatches, headVectors, faceOrigins3D, normPogs };
}
