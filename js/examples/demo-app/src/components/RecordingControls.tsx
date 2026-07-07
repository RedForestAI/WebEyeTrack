/**
 * Recording Controls Component
 *
 * UI for starting/stopping video and gaze recording
 * Shows recording status, duration, and sample count
 */

import React from 'react';

interface RecordingControlsProps {
  isRecording: boolean;
  duration: number;        // milliseconds
  sampleCount: number;
  maxDuration: number;     // milliseconds (30 minutes = 1800000)
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export default function RecordingControls({
  isRecording,
  duration,
  sampleCount,
  maxDuration,
  onStartRecording,
  onStopRecording,
}: RecordingControlsProps) {
  // Format duration as MM:SS
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progress = (duration / maxDuration) * 100;

  // Warning when approaching limit
  const isApproachingLimit = duration > maxDuration * 0.9; // 90% = 27 minutes

  return (
    <div className="fixed bottom-0 left-0 right-0 flex items-center gap-4 px-4 py-3 bg-white border-t shadow-lg z-50">
      {/* Recording Button */}
      <button
        onClick={isRecording ? onStopRecording : onStartRecording}
        className={`
          px-6 py-2 rounded-md font-semibold transition-all duration-200
          ${isRecording
            ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
            : 'bg-green-600 hover:bg-green-700 text-white'
          }
        `}
      >
        {isRecording ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 bg-white rounded-full"></span>
            Stop Recording
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 bg-white rounded-full"></span>
            Start Recording
          </span>
        )}
      </button>

      {/* Recording Status */}
      {isRecording && (
        <>
          {/* Duration Display */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm font-medium">Duration:</span>
            <span className={`text-lg font-mono font-bold ${
              isApproachingLimit ? 'text-red-600' : 'text-gray-900'
            }`}>
              {formatDuration(duration)} / {formatDuration(maxDuration)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 max-w-xs">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isApproachingLimit ? 'bg-red-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Sample Count */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm font-medium">Samples:</span>
            <span className="text-lg font-mono font-bold text-gray-900">
              {sampleCount.toLocaleString()}
            </span>
          </div>

          {/* Warning */}
          {isApproachingLimit && (
            <div className="text-red-600 text-sm font-semibold animate-pulse">
              ⚠️ Approaching 30-minute limit
            </div>
          )}
        </>
      )}

      {/* Recording Indicator Dot (always visible when recording) */}
      {isRecording && (
        <div className="ml-auto">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-red-600">RECORDING</span>
          </div>
        </div>
      )}
    </div>
  );
}
