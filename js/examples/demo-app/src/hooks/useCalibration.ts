/**
 * useCalibration Hook
 *
 * Manages calibration workflow state and logic
 * Reference: Python implementation at python/demo/main.py:195-277
 *
 * Workflow:
 * 1. Display instructions
 * 2. For each calibration point:
 *    - Show animated dot
 *    - Collect 20-30 gaze samples
 *    - Apply statistical filtering
 * 3. Call tracker.adapt() with Python defaults
 * 4. Display completion message
 */

import React, { useState, useCallback, useRef } from 'react';
import { GazeResult } from 'webeyetrack';
import {
  CalibrationState,
  CalibrationSample,
  CalibrationPointData,
  CalibrationConfig,
  DEFAULT_CALIBRATION_POSITIONS,
  DEFAULT_CALIBRATION_CONFIG,
} from '../types/calibration';
import { filterSamples, prepareAdaptationData } from '../utils/calibrationHelpers';

interface UseCalibrationProps {
  /** WebEyeTrackProxy instance with adapt() method */
  tracker: any;  // WebEyeTrackProxy type

  /** Calibration configuration */
  config?: Partial<CalibrationConfig>;

  /** Callback when calibration completes successfully */
  onComplete?: () => void;

  /** Callback when calibration fails */
  onError?: (error: string) => void;
}

export function useCalibration({
  tracker,
  config: userConfig = {},
  onComplete,
  onError
}: UseCalibrationProps) {
  // Memoize config to prevent dependency changes
  const config = React.useMemo(
    () => ({ ...DEFAULT_CALIBRATION_CONFIG, ...userConfig }),
    [userConfig]
  );

  // Calibration state
  const [state, setState] = useState<CalibrationState>({
    status: 'idle',
    currentPointIndex: 0,
    totalPoints: config.numPoints,
    pointsData: []
  });

  // Reference to current sample collection
  const samplesRef = useRef<CalibrationSample[]>([]);
  const collectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle incoming gaze results during sample collection
   */
  const handleGazeResult = useCallback((gazeResult: GazeResult) => {
    if (state.status !== 'collecting' || !gazeResult) return;

    const currentPoint = DEFAULT_CALIBRATION_POSITIONS[state.currentPointIndex];

    // Add sample to collection
    samplesRef.current.push({
      gazeResult,
      groundTruth: currentPoint,
      timestamp: Date.now()
    });

    console.log(`Collected sample ${samplesRef.current.length}/${config.samplesPerPoint} for point ${state.currentPointIndex + 1}`);
  }, [state.status, state.currentPointIndex, config.samplesPerPoint]);

  /**
   * Reset calibration state to idle
   * Defined first so other callbacks can depend on it
   */
  const resetCalibration = useCallback(() => {
    samplesRef.current = [];
    setState({
      status: 'idle',
      currentPointIndex: 0,
      totalPoints: config.numPoints,
      pointsData: []
    });
  }, [config.numPoints]);

  /**
   * Perform model adaptation using collected calibration data
   * Reference: Python main.py:246-253
   */
  const performAdaptation = useCallback(async (pointsData: CalibrationPointData[]) => {
    console.log('Performing model adaptation with', pointsData.length, 'calibration points');

    setState(prev => ({ ...prev, status: 'processing' }));

    try {
      // Extract filtered samples
      const filteredSamples = pointsData
        .map(pd => pd.filteredSample)
        .filter(s => s !== undefined) as CalibrationSample[];

      if (filteredSamples.length < 3) {
        throw new Error(`Insufficient calibration points: ${filteredSamples.length} (minimum 3 required)`);
      }

      // Prepare data for tracker.adapt()
      const { eyePatches, headVectors, faceOrigins3D, normPogs } = prepareAdaptationData(filteredSamples);

      console.log('Calling tracker.adapt() with:');
      console.log('  - Points:', normPogs);
      console.log('  - stepsInner:', config.stepsInner, '(matches Python main.py:250)');
      console.log('  - innerLR:', config.innerLR, '(matches Python main.py:251)');

      // Call adaptation with Python default parameters
      // CRITICAL: Use stepsInner=10, innerLR=1e-4 (Python defaults), NOT JS defaults (1, 1e-5)
      await tracker.adapt(
        eyePatches,
        headVectors,
        faceOrigins3D,
        normPogs,
        config.stepsInner,  // 10 (Python main.py:250)
        config.innerLR,     // 1e-4 (Python main.py:251)
        'calib'             // Point type
      );

      console.log('Calibration adaptation complete!');

      setState(prev => ({
        ...prev,
        status: 'complete',
        pointsData
      }));

      if (onComplete) {
        onComplete();
      }

      // Auto-close after 2 seconds
      setTimeout(() => {
        resetCalibration();
      }, 2000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Calibration failed';
      console.error('Calibration error:', errorMessage);

      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage
      }));

      if (onError) {
        onError(errorMessage);
      }
    }
  }, [tracker, config, onComplete, onError, resetCalibration]);

  /**
   * Finish collecting samples for current point
   * Apply filtering and move to next point or complete calibration
   *
   * NOTE: Uses functional setState to avoid stale closure issues.
   * Dependencies are minimized to prevent callback churn.
   */
  const finishCurrentPoint = useCallback(async () => {
    if (collectionTimerRef.current) {
      clearTimeout(collectionTimerRef.current);
      collectionTimerRef.current = null;
    }

    const currentSamples = [...samplesRef.current];

    // Use setState callback form to get current state values
    // This avoids stale closure issues with state.currentPointIndex
    setState(prev => {
      const currentPoint = DEFAULT_CALIBRATION_POSITIONS[prev.currentPointIndex];

      console.log(`Finishing point ${prev.currentPointIndex + 1}, collected ${currentSamples.length} samples`);

      // Apply statistical filtering (matching Python main.py:217-238)
      const filteredSample = filterSamples(currentSamples);

      if (!filteredSample) {
        const error = `Failed to collect samples for point ${prev.currentPointIndex + 1}`;
        console.error(error);
        if (onError) onError(error);
        return { ...prev, status: 'error' as const, error };
      }

      // Store point data
      const pointData: CalibrationPointData = {
        position: currentPoint,
        samples: currentSamples,
        filteredSample
      };

      const newPointsData = [...prev.pointsData, pointData];

      // Check if this was the last point
      if (prev.currentPointIndex + 1 >= config.numPoints) {
        // All points collected, perform adaptation (async, outside setState)
        // Schedule adaptation after state update
        setTimeout(() => performAdaptation(newPointsData), 0);
        return { ...prev, status: 'processing' as const, pointsData: newPointsData };
      } else {
        // Move to next point
        return {
          ...prev,
          currentPointIndex: prev.currentPointIndex + 1,
          pointsData: newPointsData,
          status: 'collecting' as const
        };
      }
    });
  }, [config.numPoints, onError, performAdaptation]);

  // Use ref for finishCurrentPoint to prevent handleAnimationComplete from changing
  const finishCurrentPointRef = useRef(finishCurrentPoint);
  React.useEffect(() => {
    finishCurrentPointRef.current = finishCurrentPoint;
  }, [finishCurrentPoint]);

  /**
   * Handle animation completion (dot turned white)
   * Start collecting samples
   *
   * NOTE: Uses refs to avoid callback churn that was causing infinite timer resets
   */
  const handleAnimationComplete = useCallback(() => {
    if (state.status !== 'collecting') return;

    console.log(`Animation complete for point ${state.currentPointIndex + 1}, starting sample collection`);

    // Clear previous samples
    samplesRef.current = [];

    // Stop collection after specified duration
    // Use ref to always call the latest finishCurrentPoint without dependency churn
    collectionTimerRef.current = setTimeout(() => {
      finishCurrentPointRef.current();
    }, config.collectionDuration);
  }, [state.status, state.currentPointIndex, config.collectionDuration]);

  /**
   * Start calibration workflow
   * IMPORTANT: Clears previous calibration AND clickstream data to support re-calibration
   */
  const startCalibration = useCallback(() => {
    if (!tracker) {
      const error = 'Tracker not initialized';
      console.error(error);
      if (onError) onError(error);
      return;
    }

    console.log('Starting calibration with config:', config);

    // Clear ALL previous buffer data (both calibration and clickstream)
    // This ensures stale data from previous calibration context doesn't contaminate new calibration
    if (tracker.resetAllBuffers) {
      console.log('🔄 Resetting all buffers (calibration + clickstream) for fresh start');
      tracker.resetAllBuffers();
    } else if (tracker.clearCalibrationBuffer) {
      // Fallback for older API (only clears calibration, not clickstream)
      console.warn('⚠️ resetAllBuffers() not available - using clearCalibrationBuffer() fallback');
      console.warn('⚠️ Clickstream buffer will NOT be cleared - may contain stale data');
      tracker.clearCalibrationBuffer();
    } else {
      console.warn('⚠️ No buffer clearing methods available - old data may persist');
    }

    setState({
      status: 'instructions',
      currentPointIndex: 0,
      totalPoints: config.numPoints,
      pointsData: []
    });

    // Move to first calibration point after brief delay
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        status: 'collecting'
      }));
    }, 3000);  // 3 second instruction display
  }, [tracker, config, onError]);

  /**
   * Cancel calibration and reset state
   */
  const cancelCalibration = useCallback(() => {
    if (collectionTimerRef.current) {
      clearTimeout(collectionTimerRef.current);
      collectionTimerRef.current = null;
    }

    resetCalibration();
  }, [resetCalibration]);

  return {
    state,
    startCalibration,
    cancelCalibration,
    handleGazeResult,
    handleAnimationComplete,
    isCalibrating: state.status !== 'idle'
  };
}
