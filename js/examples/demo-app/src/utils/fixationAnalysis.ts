/**
 * Fixation Analysis Utilities
 *
 * Runs all three kollaR-ts algorithms (I2MC, I-VT, I-DT) on recorded gaze data
 * Provides progress callbacks for UI updates
 */

import { preprocessGaze, algorithmI2MC, algorithmIVT, algorithmIDT } from 'kollar-ts';
import type { RawGazeData } from '../types/recording';
import type { AnalysisResults } from '../types/analysis';

/**
 * Analyze gaze data with all three algorithms
 *
 * This is the main analysis function that runs:
 * 1. Preprocessing (interpolation + smoothing)
 * 2. I2MC (clustering-based, most robust)
 * 3. I-VT (velocity-based, includes saccades)
 * 4. I-DT (dispersion-based, simplest)
 *
 * @param gazeData - Raw gaze data points
 * @param oneDegree - Pixels per degree of visual angle
 * @param onProgress - Optional progress callback
 * @returns Complete analysis results from all algorithms
 */
export async function analyzeAllAlgorithms(
  gazeData: RawGazeData[],
  oneDegree: number,
  onProgress?: (stage: string, percent: number, algorithm?: string) => void
): Promise<AnalysisResults> {

  if (gazeData.length === 0) {
    throw new Error('No gaze data to analyze');
  }

  // Validate oneDegree parameter (typical range: 20-60 px/degree)
  if (oneDegree < 15 || oneDegree > 80) {
    throw new Error(`oneDegree out of valid range: ${oneDegree.toFixed(2)} (expected 15-80 px/degree)`);
  }

  console.log(`Starting analysis of ${gazeData.length} gaze points`);
  console.log(`oneDegree parameter: ${oneDegree.toFixed(2)} px/degree`);

  onProgress?.('Preprocessing gaze data...', 0);

  // Step 1: Preprocess (shared by all algorithms)
  // This interpolates missing data and applies smoothing
  const processed = preprocessGaze(gazeData, {
    maxGapMs: 75,   // Interpolate gaps up to 75ms
    marginMs: 5,    // Use 5ms margin for interpolation
    filterMs: 15,   // 15ms moving average window
  });

  console.log(`Preprocessing complete: ${processed.length} samples`);

  onProgress?.('Running I2MC algorithm...', 25, 'i2mc');

  // Step 2: I2MC (most robust, slowest)
  // Uses k-means clustering to detect fixations
  // Best for noisy data and robust detection

  // Calculate appropriate downsampling factors based on data length and sampling rate
  const duration = gazeData[gazeData.length - 1].timestamp - gazeData[0].timestamp;
  const samplingRate = processed.length / (duration / 1000); // Hz
  const windowSamples = Math.floor((200 / 1000) * samplingRate); // Samples in 200ms window

  // Ensure downsampled windows have at least 10 samples for k-means (k=2)
  const maxDownsample = Math.floor(windowSamples / 10);
  let downsamplingFactors = [2, 5, 10].filter(f => f <= maxDownsample);

  // If no valid downsampling factors, use minimal multi-scale
  if (downsamplingFactors.length === 0) {
    downsamplingFactors = [1];
  }

  console.log(`I2MC config: sampling rate=${samplingRate.toFixed(1)} Hz, window samples=${windowSamples}, downsampling factors=[${downsamplingFactors}]`);

  const i2mcResult = algorithmI2MC(processed, {
    windowLengthMs: 200,               // 200ms analysis window
    downsamplingFactors,               // Adaptive downsampling based on data
    weightThreshold: 2,                // 2 SD threshold
    minFixationDuration: 100,          // 100ms minimum
    oneDegree,
    distanceThreshold: 0.7,            // degrees
    mergeMsThreshold: 40,              // ms
    missingSamplesThreshold: 0.5,      // 50% max missing
  });

  console.log(`I2MC complete: ${i2mcResult.fixations.length} fixations`);

  onProgress?.('Running I-VT algorithm...', 50, 'ivt');

  // Step 3: I-VT (velocity-based, includes saccades)
  // Fast and includes saccade detection
  // Good for high-frequency data
  const ivtResult = algorithmIVT(processed, {
    velocityThreshold: 30,             // 30 degrees/second
    minFixationDuration: 100,          // 100ms minimum
    minSaccadeDuration: 20,            // 20ms minimum for saccades
    minSaccadeAmplitude: 0.5,          // 0.5 degrees minimum
    oneDegree,
    saveVelocityProfiles: true,        // Save velocity data for saccades
    distanceThreshold: 0.7,            // degrees
    mergeMsThreshold: 40,              // ms
    missingSamplesThreshold: 0.5,      // 50% max missing
  });

  console.log(`I-VT complete: ${ivtResult.fixations.length} fixations, ${ivtResult.saccades?.length || 0} saccades`);

  onProgress?.('Running I-DT algorithm...', 75, 'idt');

  // Step 4: I-DT (dispersion-based, simplest)
  // Fast and simple dispersion threshold
  // Good for lower-frequency data
  const idtResult = algorithmIDT(processed, {
    dispersionThreshold: 1.0,          // 1.0 degree maximum dispersion
    minDuration: 100,                  // 100ms minimum
    oneDegree,
    distanceThreshold: 0.7,            // degrees
    mergeMsThreshold: 40,              // ms
    missingSamplesThreshold: 0.5,      // 50% max missing
  });

  console.log(`I-DT complete: ${idtResult.fixations.length} fixations`);

  onProgress?.('Analysis complete!', 100);

  // Return results with metadata
  return {
    i2mc: i2mcResult,
    ivt: ivtResult,
    idt: idtResult,
    metadata: {
      duration, // Already calculated above for I2MC
      sampleCount: gazeData.length,
      oneDegree,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
    },
  };
}

/**
 * Calculate summary statistics for comparison
 */
export function calculateSummaryStats(results: AnalysisResults) {
  const calcFixationStats = (fixations: Array<{ duration: number; rmsd: number }>) => {
    if (fixations.length === 0) {
      return {
        count: 0,
        meanDuration: 0,
        totalDuration: 0,
        meanPrecision: 0,
      };
    }

    return {
      count: fixations.length,
      meanDuration: fixations.reduce((sum, f) => sum + f.duration, 0) / fixations.length,
      totalDuration: fixations.reduce((sum, f) => sum + f.duration, 0),
      meanPrecision: fixations.reduce((sum, f) => sum + f.rmsd, 0) / fixations.length,
    };
  };

  return {
    i2mc: calcFixationStats(results.i2mc.fixations),
    ivt: calcFixationStats(results.ivt.fixations),
    idt: calcFixationStats(results.idt.fixations),
    saccadeCount: results.ivt.saccades?.length || 0,
    totalDuration: results.metadata.duration,
    sampleCount: results.metadata.sampleCount,
  };
}
