/**
 * Metrics Calculation Utility
 *
 * Computes comprehensive statistics for fixation and saccade data
 * Enables comparison across different algorithms
 */

import type { Fixation, Saccade } from 'kollar-ts';

export interface FixationMetrics {
  count: number;
  totalDuration: number;
  meanDuration: number;
  medianDuration: number;
  stdDuration: number;
  minDuration: number;
  maxDuration: number;
  spatialSpread: number; // Standard deviation of fixation positions
  coverageArea: number; // Percentage of screen covered by fixations
}

export interface SaccadeMetrics {
  count: number;
  meanAmplitude: number;
  medianAmplitude: number;
  stdAmplitude: number;
  minAmplitude: number;
  maxAmplitude: number;
  meanDuration: number;
  totalDuration: number;
  meanVelocity: number; // Degrees per second
}

export interface AlgorithmMetrics {
  fixations: FixationMetrics;
  saccades: SaccadeMetrics | null;
}

export interface ComparisonMetrics {
  i2mc: AlgorithmMetrics;
  ivt: AlgorithmMetrics;
  idt: AlgorithmMetrics;
  overall: {
    totalDuration: number;
    sampleCount: number;
    samplingRate: number;
    screenWidth: number;
    screenHeight: number;
    oneDegree: number;
  };
}

/**
 * Calculate fixation metrics
 */
export function calculateFixationMetrics(
  fixations: Fixation[],
  screenWidth: number,
  screenHeight: number
): FixationMetrics {
  if (fixations.length === 0) {
    return {
      count: 0,
      totalDuration: 0,
      meanDuration: 0,
      medianDuration: 0,
      stdDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      spatialSpread: 0,
      coverageArea: 0,
    };
  }

  const durations = fixations.map(f => f.duration);
  const totalDuration = durations.reduce((sum, d) => sum + d, 0);
  const meanDuration = totalDuration / fixations.length;

  // Median
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const medianDuration = sortedDurations[Math.floor(sortedDurations.length / 2)];

  // Standard deviation
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - meanDuration, 2), 0) / fixations.length;
  const stdDuration = Math.sqrt(variance);

  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  // Spatial spread (std of x and y positions)
  const meanX = fixations.reduce((sum, f) => sum + f.x, 0) / fixations.length;
  const meanY = fixations.reduce((sum, f) => sum + f.y, 0) / fixations.length;
  const varianceX = fixations.reduce((sum, f) => sum + Math.pow(f.x - meanX, 2), 0) / fixations.length;
  const varianceY = fixations.reduce((sum, f) => sum + Math.pow(f.y - meanY, 2), 0) / fixations.length;
  const spatialSpread = Math.sqrt(varianceX + varianceY);

  // Coverage area (simplified - percentage of unique 100x100 grid cells)
  const gridSize = 100;
  const cells = new Set<string>();
  fixations.forEach(f => {
    const gridX = Math.floor(f.x / gridSize);
    const gridY = Math.floor(f.y / gridSize);
    cells.add(`${gridX},${gridY}`);
  });
  const totalCells = Math.ceil(screenWidth / gridSize) * Math.ceil(screenHeight / gridSize);
  const coverageArea = (cells.size / totalCells) * 100;

  return {
    count: fixations.length,
    totalDuration,
    meanDuration,
    medianDuration,
    stdDuration,
    minDuration,
    maxDuration,
    spatialSpread,
    coverageArea,
  };
}

/**
 * Calculate saccade metrics
 */
export function calculateSaccadeMetrics(saccades: Saccade[]): SaccadeMetrics | null {
  if (saccades.length === 0) {
    return null;
  }

  const amplitudes = saccades.map(s => s.amplitude);
  const durations = saccades.map(s => s.duration);

  const meanAmplitude = amplitudes.reduce((sum, a) => sum + a, 0) / amplitudes.length;
  const sortedAmplitudes = [...amplitudes].sort((a, b) => a - b);
  const medianAmplitude = sortedAmplitudes[Math.floor(sortedAmplitudes.length / 2)];

  const varianceAmplitude = amplitudes.reduce((sum, a) => sum + Math.pow(a - meanAmplitude, 2), 0) / amplitudes.length;
  const stdAmplitude = Math.sqrt(varianceAmplitude);

  const minAmplitude = Math.min(...amplitudes);
  const maxAmplitude = Math.max(...amplitudes);

  const totalDuration = durations.reduce((sum, d) => sum + d, 0);
  const meanDuration = totalDuration / saccades.length;

  // Mean velocity (amplitude / duration in seconds)
  const velocities = saccades.map(s => s.amplitude / (s.duration / 1000));
  const meanVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;

  return {
    count: saccades.length,
    meanAmplitude,
    medianAmplitude,
    stdAmplitude,
    minAmplitude,
    maxAmplitude,
    meanDuration,
    totalDuration,
    meanVelocity,
  };
}

/**
 * Calculate comparison metrics for all algorithms
 */
export function calculateComparisonMetrics(
  i2mcFixations: Fixation[],
  ivtFixations: Fixation[],
  idtFixations: Fixation[],
  ivtSaccades: Saccade[] | undefined,
  metadata: {
    duration: number;
    sampleCount: number;
    screenWidth: number;
    screenHeight: number;
    oneDegree: number;
  }
): ComparisonMetrics {
  return {
    i2mc: {
      fixations: calculateFixationMetrics(i2mcFixations, metadata.screenWidth, metadata.screenHeight),
      saccades: null,
    },
    ivt: {
      fixations: calculateFixationMetrics(ivtFixations, metadata.screenWidth, metadata.screenHeight),
      saccades: ivtSaccades ? calculateSaccadeMetrics(ivtSaccades) : null,
    },
    idt: {
      fixations: calculateFixationMetrics(idtFixations, metadata.screenWidth, metadata.screenHeight),
      saccades: null,
    },
    overall: {
      totalDuration: metadata.duration,
      sampleCount: metadata.sampleCount,
      samplingRate: metadata.sampleCount / (metadata.duration / 1000),
      screenWidth: metadata.screenWidth,
      screenHeight: metadata.screenHeight,
      oneDegree: metadata.oneDegree,
    },
  };
}

/**
 * Format number with specified decimal places
 */
export function formatMetric(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * Format duration in ms to seconds
 */
export function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(2) + 's';
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  return value.toFixed(1) + '%';
}
