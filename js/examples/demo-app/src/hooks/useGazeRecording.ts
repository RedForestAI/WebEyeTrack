/**
 * Gaze data recording hook
 *
 * Buffers gaze points during recording session
 * Converts from normalized coordinates to pixels for kollaR-ts
 */

import { useState, useRef, useCallback } from 'react';
import type { GazeResult } from 'webeyetrack';
import type { RawGazeData, RecordingMetadata } from '../types/recording';

interface UseGazeRecordingReturn {
  isRecording: boolean;
  sampleCount: number;
  startRecording: (metadata: Omit<RecordingMetadata, 'startTime' | 'sampleCount' | 'endTime' | 'duration'>) => void;
  recordGazePoint: (gazeResult: GazeResult) => void;
  stopRecording: () => { gazeData: RawGazeData[]; metadata: RecordingMetadata };
  clearRecording: () => void;
}

export function useGazeRecording(): UseGazeRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);

  const gazeBufferRef = useRef<RawGazeData[]>([]);
  const metadataRef = useRef<RecordingMetadata | null>(null);
  const isRecordingRef = useRef(false); // Use ref to avoid stale closure
  const baselineTimestampRef = useRef<number | null>(null); // Baseline for timestamp normalization

  const startRecording = useCallback((
    metadata: Omit<RecordingMetadata, 'startTime' | 'sampleCount' | 'endTime' | 'duration'>
  ) => {
    gazeBufferRef.current = [];
    setSampleCount(0);
    setIsRecording(true);
    isRecordingRef.current = true; // Update ref
    baselineTimestampRef.current = null; // Reset baseline (will be set on first gaze point)

    metadataRef.current = {
      ...metadata,
      startTime: Date.now(),
      sampleCount: 0,
    };

    console.log('Gaze recording started - baseline timestamp will be set on first gaze point');
  }, []);

  const recordGazePoint = useCallback((gazeResult: GazeResult) => {
    // Check ref instead of state to avoid stale closure
    if (!isRecordingRef.current) {
      return;
    }

    // Convert normalized coordinates [-0.5, 0.5] to pixels
    const x = (gazeResult.normPog[0] + 0.5) * window.innerWidth;
    const y = (gazeResult.normPog[1] + 0.5) * window.innerHeight;

    // Skip if eyes are closed (blink)
    if (gazeResult.gazeState === 'closed') {
      return;
    }

    // Convert timestamp from seconds to milliseconds
    const timestampMs = gazeResult.timestamp * 1000;

    // Set baseline on first gaze point (normalize all timestamps to start at 0ms)
    if (baselineTimestampRef.current === null) {
      baselineTimestampRef.current = timestampMs;
      console.log(`📍 Baseline timestamp set: ${timestampMs.toFixed(2)}ms`);
    }

    // Normalize timestamp relative to recording start (0ms = first gaze point)
    const normalizedTimestamp = timestampMs - baselineTimestampRef.current;

    // Add to buffer with normalized timestamp
    gazeBufferRef.current.push({
      timestamp: normalizedTimestamp,
      x,
      y,
    });

    setSampleCount((prev) => prev + 1);
  }, []); // No dependencies - uses ref instead

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    isRecordingRef.current = false; // Update ref

    const endTime = Date.now();
    const finalMetadata: RecordingMetadata = {
      ...metadataRef.current!,
      endTime,
      duration: endTime - metadataRef.current!.startTime,
      sampleCount: gazeBufferRef.current.length,
    };

    console.log(`Gaze recording stopped. Collected ${finalMetadata.sampleCount} samples`);

    return {
      gazeData: gazeBufferRef.current,
      metadata: finalMetadata,
    };
  }, []);

  const clearRecording = useCallback(() => {
    gazeBufferRef.current = [];
    metadataRef.current = null;
    baselineTimestampRef.current = null; // Reset baseline
    setSampleCount(0);
    setIsRecording(false);
    isRecordingRef.current = false; // Update ref
  }, []);

  return {
    isRecording,
    sampleCount,
    startRecording,
    recordGazePoint,
    stopRecording,
    clearRecording,
  };
}
