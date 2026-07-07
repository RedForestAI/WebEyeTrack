/**
 * Realtime Fixation Overlay Component
 *
 * Displays current fixations detected by I-VT and I-DT algorithms
 * in real-time over the screen
 */

import React from 'react';

interface RealtimeFixation {
  algorithm: 'ivt' | 'idt';
  x: number;
  y: number;
  duration: number;
  timestamp: number;
}

interface RealtimeFixationOverlayProps {
  fixationIVT: RealtimeFixation | null;
  fixationIDT: RealtimeFixation | null;
  showIVT: boolean;
  showIDT: boolean;
}

export default function RealtimeFixationOverlay({
  fixationIVT,
  fixationIDT,
  showIVT,
  showIDT,
}: RealtimeFixationOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {/* I-VT Fixation (Blue) */}
      {showIVT && fixationIVT && (
        <div
          className="absolute"
          style={{
            left: fixationIVT.x,
            top: fixationIVT.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Outer circle */}
          <div
            className="absolute rounded-full border-4 border-blue-500 bg-blue-500 bg-opacity-10 animate-pulse"
            style={{
              width: 60,
              height: 60,
              left: -30,
              top: -30,
            }}
          />
          {/* Inner dot */}
          <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-1.5 -top-1.5" />
          {/* Label */}
          <div className="absolute left-8 top-0 bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap">
            I-VT: {fixationIVT.duration.toFixed(0)}ms
          </div>
        </div>
      )}

      {/* I-DT Fixation (Yellow) */}
      {showIDT && fixationIDT && (
        <div
          className="absolute"
          style={{
            left: fixationIDT.x,
            top: fixationIDT.y,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Outer circle */}
          <div
            className="absolute rounded-full border-4 border-yellow-500 bg-yellow-500 bg-opacity-10 animate-pulse"
            style={{
              width: 50,
              height: 50,
              left: -25,
              top: -25,
            }}
          />
          {/* Inner dot */}
          <div className="absolute w-3 h-3 bg-yellow-500 rounded-full -left-1.5 -top-1.5" />
          {/* Label */}
          <div className="absolute left-8 top-4 bg-yellow-500 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap">
            I-DT: {fixationIDT.duration.toFixed(0)}ms
          </div>
        </div>
      )}

      {/* Info box when algorithms are enabled but no fixation detected */}
      {(showIVT || showIDT) && !fixationIVT && !fixationIDT && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded text-sm">
          Real-time detection active (no fixation detected)
        </div>
      )}
    </div>
  );
}
