/**
 * CalibrationProgress Component
 *
 * Displays calibration progress with text and visual indicators
 */

import React from 'react';

interface CalibrationProgressProps {
  /** Current calibration point index (0-based) */
  currentIndex: number;

  /** Total number of calibration points */
  totalPoints: number;

  /** Optional status message */
  statusMessage?: string;
}

export default function CalibrationProgress({
  currentIndex,
  totalPoints,
  statusMessage
}: CalibrationProgressProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Text progress */}
      <div className="text-white text-2xl font-bold">
        {statusMessage || `Point ${currentIndex + 1} of ${totalPoints}`}
      </div>

      {/* Visual dot indicators */}
      <div className="flex gap-3">
        {Array.from({ length: totalPoints }).map((_, index) => (
          <div
            key={index}
            className="rounded-full transition-all"
            style={{
              width: index === currentIndex ? 16 : 12,
              height: index === currentIndex ? 16 : 12,
              backgroundColor: index <= currentIndex ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
              border: index === currentIndex ? '2px solid #fff' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}
