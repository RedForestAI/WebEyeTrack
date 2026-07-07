/**
 * Screen Calibration Dialog
 *
 * Prompts user to enter fullscreen and select monitor size
 * Calculates oneDegree parameter for accurate fixation detection
 */

import React, { useState, useEffect } from 'react';
import {
  SCREEN_PRESETS,
  detectScreenType,
  calculateOneDegree,
  validateOneDegree,
  savePreset,
  loadSavedPreset,
} from '../utils/screenCalibration';
import { useFullscreen } from '../hooks/useFullscreen';

interface ScreenCalibrationDialogProps {
  onComplete: (oneDegree: number, preset: string) => void;
  onCancel: () => void;
}

export default function ScreenCalibrationDialog({
  onComplete,
  onCancel,
}: ScreenCalibrationDialogProps) {
  const {
    isFullscreen,
    isSupported,
    screenWidth,
    screenHeight,
    enterFullscreen,
  } = useFullscreen();

  const [step, setStep] = useState<'intro' | 'fullscreen' | 'select'>('intro');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customDistance, setCustomDistance] = useState<number | null>(null);
  const [oneDegree, setOneDegree] = useState<number>(40);
  const [validation, setValidation] = useState<{ valid: boolean; warning?: string }>({
    valid: true,
  });

  // Auto-detect screen type when entering fullscreen
  useEffect(() => {
    if (isFullscreen && step === 'fullscreen') {
      const detection = detectScreenType(screenWidth, screenHeight);

      // Try to load saved preset first
      const savedPreset = loadSavedPreset();
      const presetToUse = savedPreset || detection.presetId;

      setSelectedPreset(presetToUse);
      setStep('select');

      // Calculate initial oneDegree
      const preset = SCREEN_PRESETS[presetToUse];
      if (preset) {
        const calculated = calculateOneDegree(
          preset.widthCm,
          preset.typicalDistanceCm,
          screenWidth
        );
        setOneDegree(calculated);
        setValidation(validateOneDegree(calculated));
      }
    }
  }, [isFullscreen, screenWidth, screenHeight, step]);

  // Recalculate oneDegree when preset or distance changes
  useEffect(() => {
    if (selectedPreset && screenWidth) {
      const preset = SCREEN_PRESETS[selectedPreset];
      if (preset) {
        const distance = customDistance || preset.typicalDistanceCm;
        const calculated = calculateOneDegree(
          preset.widthCm,
          distance,
          screenWidth
        );
        setOneDegree(calculated);
        setValidation(validateOneDegree(calculated));
      }
    }
  }, [selectedPreset, customDistance, screenWidth]);

  const handleEnterFullscreen = async () => {
    const success = await enterFullscreen();
    if (success) {
      setStep('fullscreen');
    } else {
      alert('Fullscreen mode is required for accurate calibration. Please allow fullscreen access.');
    }
  };

  const handleConfirm = () => {
    if (validation.valid) {
      savePreset(selectedPreset);
      onComplete(oneDegree, selectedPreset);
    }
  };

  if (step === 'intro') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <h2 className="text-2xl font-bold mb-4">Screen Calibration Required</h2>

          <div className="space-y-4 text-gray-700">
            <p>
              For accurate gaze tracking, we need to know your screen size and viewing distance.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <h3 className="font-semibold mb-2">Why fullscreen?</h3>
              <p className="text-sm">
                Fullscreen mode allows us to accurately detect your screen dimensions,
                ensuring precise fixation detection and analysis.
              </p>
            </div>

            {!isSupported && (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <p className="text-sm text-red-700">
                  Warning: Your browser does not support fullscreen mode.
                  Calibration accuracy may be reduced.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleEnterFullscreen}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-semibold"
            >
              Enter Fullscreen
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <h2 className="text-2xl font-bold mb-4">Detecting Screen...</h2>
          <p className="text-gray-600">Please wait while we detect your screen dimensions.</p>
          <div className="mt-4 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  // Step: select
  const currentPreset = SCREEN_PRESETS[selectedPreset];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Confirm Your Screen Setup</h2>

        <div className="space-y-6">
          {/* Detected Dimensions */}
          <div className="bg-gray-50 rounded p-4">
            <h3 className="font-semibold mb-2">Detected Screen</h3>
            <p className="text-sm text-gray-600">
              Resolution: {screenWidth} × {screenHeight} pixels
            </p>
          </div>

          {/* Monitor Size Selection */}
          <div>
            <label className="block font-semibold mb-2">Select Your Monitor Size</label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.values(SCREEN_PRESETS).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} ({preset.widthCm.toFixed(1)}cm × {preset.heightCm.toFixed(1)}cm)
                </option>
              ))}
            </select>
          </div>

          {/* Viewing Distance */}
          <div>
            <label className="block font-semibold mb-2">
              Viewing Distance (Optional)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                placeholder={currentPreset?.typicalDistanceCm.toString()}
                value={customDistance || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseInt(e.target.value) : null;
                  setCustomDistance(value);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="30"
                max="150"
              />
              <span className="text-gray-600">cm</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Leave empty to use typical distance: {currentPreset?.typicalDistanceCm}cm
            </p>
          </div>

          {/* Calculated Parameters */}
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h3 className="font-semibold mb-2">Calculated Parameters</h3>
            <div className="space-y-1 text-sm">
              <p>Screen width: {currentPreset?.widthCm.toFixed(1)}cm</p>
              <p>Viewing distance: {customDistance || currentPreset?.typicalDistanceCm}cm</p>
              <p className="font-semibold text-blue-900">
                Pixels per degree: {oneDegree.toFixed(2)}
              </p>
            </div>

            {validation.warning && (
              <div className={`mt-3 p-2 rounded ${
                validation.valid ? 'bg-yellow-50 text-yellow-800' : 'bg-red-50 text-red-800'
              }`}>
                <p className="text-sm">{validation.warning}</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="text-sm text-gray-600">
            <p>
              💡 Tip: For best results, sit at a comfortable distance from your screen
              (typically 50-70cm) and maintain that distance during calibration and recording.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!validation.valid}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
