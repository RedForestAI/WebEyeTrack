/**
 * CalibrationDot Component
 *
 * Research-grade concentric rings calibration target (Tobii/SMI style)
 * Reference: Python implementation at python/demo/calibration_widget.py
 *
 * Features:
 * - Concentric rings design: outer ring (60px) + inner ring (40px) + core (16px)
 * - Color animation: red → white (2000ms) to guide user attention
 * - Outer ring pulsing animation for visual feedback
 * - Crosshair overlay for precise fixation
 * - Glow effect on completion
 * - Positioned using normalized coordinates [-0.5, 0.5]
 */

import React, { useEffect, useState, useRef } from 'react';
import { CalibrationPoint } from '../types/calibration';
import { normalizedToPixels } from '../utils/calibrationHelpers';

interface CalibrationDotProps {
  /** Position in normalized coordinates [-0.5, 0.5] */
  position: CalibrationPoint;

  /** Duration of color animation in milliseconds (default: 2000) */
  animationDuration?: number;

  /** Callback when animation completes (dot turns white) */
  onAnimationComplete?: () => void;
}

// Design constants for concentric rings
const OUTER_RING_SIZE = 60;
const INNER_RING_SIZE = 40;
const CORE_SIZE = 16;
const CROSSHAIR_LENGTH = 50;
const CROSSHAIR_THICKNESS = 2;

export default function CalibrationDot({
  position,
  animationDuration = 2000,
  onAnimationComplete,
}: CalibrationDotProps) {
  const [isWhite, setIsWhite] = useState(false);

  // Check for reduced motion preference
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Use ref for callback to prevent effect re-running when callback reference changes
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  // Convert normalized position to pixel coordinates
  const pixelPosition = normalizedToPixels(
    position,
    window.innerWidth,
    window.innerHeight
  );

  // Trigger animation on mount or position change only
  useEffect(() => {
    setIsWhite(false);

    // Start animation after brief delay to ensure reset is visible
    const startTimer = setTimeout(() => {
      setIsWhite(true);
    }, 50);

    // Trigger completion callback when animation finishes
    const completeTimer = setTimeout(() => {
      if (onAnimationCompleteRef.current) {
        onAnimationCompleteRef.current();
      }
    }, animationDuration + 50);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [position, animationDuration]);

  // Colors
  const activeColor = isWhite ? '#ffffff' : '#ef4444'; // Tailwind red-500 → white

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: pixelPosition.x,
        top: pixelPosition.y,
      }}
    >
      {/* Outer ring - white with pulsing animation */}
      <div
        className={prefersReducedMotion.current ? '' : 'animate-pulse-ring'}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: OUTER_RING_SIZE,
          height: OUTER_RING_SIZE,
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.4)',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Inner ring - transitions red → white */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: INNER_RING_SIZE,
          height: INNER_RING_SIZE,
          borderRadius: '50%',
          border: `3px solid ${activeColor}`,
          transform: 'translate(-50%, -50%)',
          transition: `border-color ${animationDuration}ms linear`,
        }}
      />

      {/* Core dot - solid fill transitions red → white */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: CORE_SIZE,
          height: CORE_SIZE,
          borderRadius: '50%',
          backgroundColor: activeColor,
          transform: 'translate(-50%, -50%)',
          transition: `background-color ${animationDuration}ms linear`,
          boxShadow: isWhite
            ? '0 0 20px rgba(255, 255, 255, 0.5)'
            : '0 0 10px rgba(239, 68, 68, 0.3)',
        }}
      />

      {/* Crosshair - Horizontal line */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: CROSSHAIR_LENGTH,
          height: CROSSHAIR_THICKNESS,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Crosshair - Vertical line */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: CROSSHAIR_THICKNESS,
          height: CROSSHAIR_LENGTH,
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}
