/**
 * Analysis Progress Component
 *
 * Shows progress during post-hoc fixation analysis
 * Displays current stage and algorithm being processed
 */

import React from 'react';

interface AnalysisProgressProps {
  stage: string;
  percent: number;
  algorithm?: string;
}

export default function AnalysisProgress({
  stage,
  percent,
  algorithm,
}: AnalysisProgressProps) {
  // Algorithm colors
  const algorithmColor = {
    i2mc: 'text-green-600 border-green-500',
    ivt: 'text-blue-600 border-blue-500',
    idt: 'text-yellow-600 border-yellow-500',
  }[algorithm || ''] || 'text-gray-600 border-gray-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
        {/* Title */}
        <h2 className="text-2xl font-bold mb-4 text-center">
          Analyzing Gaze Data
        </h2>

        {/* Stage Description */}
        <p className="text-center text-gray-700 mb-6">{stage}</p>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-center text-sm text-gray-600 mt-2">
            {percent.toFixed(0)}% complete
          </p>
        </div>

        {/* Algorithm Indicator */}
        {algorithm && (
          <div className="flex items-center justify-center gap-3">
            <div className={`px-4 py-2 border-2 rounded-lg ${algorithmColor} font-semibold uppercase text-sm`}>
              {algorithm}
            </div>
          </div>
        )}

        {/* Animation Dots */}
        <div className="flex justify-center mt-6 space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>

        {/* Info */}
        <p className="text-center text-xs text-gray-500 mt-4">
          Running fixation detection algorithms...
        </p>
      </div>
    </div>
  );
}
