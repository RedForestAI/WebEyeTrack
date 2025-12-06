/**
 * CalibrationOverlay Component
 *
 * Full-screen calibration interface
 * Orchestrates the calibration workflow with visual feedback
 * Reference: Python implementation at python/demo/
 */

import React, { useEffect } from 'react';
import { GazeResult } from 'webeyetrack';
import CalibrationDot from './CalibrationDot';
import CalibrationProgress from './CalibrationProgress';
import { useCalibration } from '../hooks/useCalibration';
import { DEFAULT_CALIBRATION_POSITIONS, CalibrationConfig } from '../types/calibration';

interface CalibrationOverlayProps {
  /** WebEyeTrackProxy instance */
  tracker: any;

  /** Callback to receive gaze results during calibration */
  onGazeResult?: (result: GazeResult) => void;

  /** Callback when calibration completes */
  onComplete?: () => void;

  /** Callback when calibration is cancelled */
  onCancel?: () => void;

  /** Optional calibration configuration */
  config?: Partial<CalibrationConfig>;
}

export default function CalibrationOverlay({
  tracker,
  onGazeResult,
  onComplete,
  onCancel,
  config
}: CalibrationOverlayProps) {
  const {
    state,
    startCalibration,
    cancelCalibration,
    handleGazeResult,
    handleAnimationComplete
  } = useCalibration({
    tracker,
    config,
    onComplete,
    onError: (error) => {
      console.error('Calibration error:', error);
      if (onCancel) onCancel();
    }
  });

  // Forward gaze results to calibration hook
  useEffect(() => {
    if (onGazeResult) {
      // This will be connected from parent component
      // The parent should call handleGazeResult when new gaze data arrives
    }
  }, [onGazeResult]);

  // Auto-start calibration on mount
  useEffect(() => {
    startCalibration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle ESC key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelCalibration();
        if (onCancel) onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelCalibration, onCancel]);

  // Expose handleGazeResult to parent via ref or callback
  // This is a workaround since we need to connect the gaze stream
  useEffect(() => {
    if (tracker && tracker.onGazeResults) {
      const originalCallback = tracker.onGazeResults;

      // Intercept gaze results during calibration
      tracker.onGazeResults = (result: GazeResult) => {
        originalCallback(result);  // Keep original behavior
        handleGazeResult(result);  // Pass to calibration
      };

      return () => {
        tracker.onGazeResults = originalCallback;
      };
    }
  }, [tracker, handleGazeResult]);

  // Render different UI based on calibration status
  const renderContent = () => {
    switch (state.status) {
      case 'instructions':
        return (
          <div className="flex flex-col items-center gap-6">
            <div className="text-white text-4xl font-bold">
              Calibration
            </div>
            <div className="text-white text-xl text-center max-w-2xl">
              Look at each dot as it appears on the screen.
              <br />
              Focus on the crosshair center until the dot turns white.
              <br />
              <br />
              Keep your head still and look only with your eyes.
            </div>
            <div className="text-white text-lg opacity-75">
              Starting in a moment...
            </div>
          </div>
        );

      case 'collecting':
        const currentPosition = DEFAULT_CALIBRATION_POSITIONS[state.currentPointIndex];
        return (
          <>
            {/* Progress indicator at top */}
            <div className="absolute top-12 left-1/2 transform -translate-x-1/2">
              <CalibrationProgress
                currentIndex={state.currentPointIndex}
                totalPoints={state.totalPoints}
              />
            </div>

            {/* Calibration dot - key forces React to recreate component for each point */}
            <CalibrationDot
              key={state.currentPointIndex}
              position={currentPosition}
              onAnimationComplete={handleAnimationComplete}
            />

            {/* Cancel hint at bottom */}
            <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 text-white text-sm opacity-50">
              Press ESC to cancel
            </div>
          </>
        );

      case 'processing':
        return (
          <div className="flex flex-col items-center gap-6">
            <div className="text-white text-3xl font-bold">
              Processing calibration...
            </div>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white"></div>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center gap-6">
            <div className="text-green-400 text-4xl font-bold">
              ✓ Calibration Complete!
            </div>
            <div className="text-white text-xl">
              Your eye tracker is now calibrated.
            </div>
            <div className="text-white text-sm opacity-75">
              Closing...
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center gap-6">
            <div className="text-red-400 text-4xl font-bold">
              Calibration Failed
            </div>
            <div className="text-white text-xl">
              {state.error || 'An error occurred during calibration'}
            </div>
            <button
              className="px-6 py-3 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition"
              onClick={() => {
                if (onCancel) onCancel();
              }}
            >
              Close
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
      {renderContent()}
    </div>
  );
}
