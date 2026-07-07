/**
 * Real-time Fixation Detection Hook (Web Worker Version)
 *
 * Offloads I-VT and I-DT algorithms to a Web Worker to prevent
 * blocking the main UI thread during real-time processing.
 *
 * Note: This is for display purposes only. The recorded data
 * will be analyzed post-hoc with all three algorithms.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { GazeResult } from 'webeyetrack';
import type { RawGazeData } from '../types/recording';
import type {
  WorkerInputMessage,
  WorkerOutputMessage,
  RealtimeFixation,
} from '../workers/FixationWorker';

const BUFFER_DURATION_MS = 2000; // 2 seconds
const PROCESS_INTERVAL_MS = 500; // Process every 500ms (reduced for better performance)
const MIN_SAMPLES_FOR_DETECTION = 60; // Minimum 1 second of data

interface UseRealtimeFixationsReturn {
  currentFixationIVT: RealtimeFixation | null;
  currentFixationIDT: RealtimeFixation | null;
  bufferSize: number;
  processGazePoint: (gazeResult: GazeResult) => void;
  reset: () => void;
  isWorkerReady: boolean;
}

export function useRealtimeFixations(
  enableIVT: boolean,
  enableIDT: boolean,
  oneDegree: number
): UseRealtimeFixationsReturn {
  const [currentFixationIVT, setCurrentFixationIVT] = useState<RealtimeFixation | null>(null);
  const [currentFixationIDT, setCurrentFixationIDT] = useState<RealtimeFixation | null>(null);
  const [bufferSize, setBufferSize] = useState(0);
  const [isWorkerReady, setIsWorkerReady] = useState(false);

  const bufferRef = useRef<RawGazeData[]>([]);
  const lastProcessTimeRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  const pendingProcessRef = useRef<boolean>(false);
  const isWorkerReadyRef = useRef<boolean>(false); // Synchronous check to avoid stale closure

  // Use refs to avoid stale closure
  const enableIVTRef = useRef(enableIVT);
  const enableIDTRef = useRef(enableIDT);
  const oneDegreeRef = useRef(oneDegree);

  // Update refs when props change
  enableIVTRef.current = enableIVT;
  enableIDTRef.current = enableIDT;
  oneDegreeRef.current = oneDegree;

  // Initialize Web Worker
  useEffect(() => {
    console.log('[FixationWorker] Initializing...');

    try {
      // Load pre-compiled worker from public directory
      const worker = new Worker(process.env.PUBLIC_URL + '/fixation.worker.js');

      // Handle messages from worker
      worker.onmessage = (event: MessageEvent<WorkerOutputMessage>) => {
        const message = event.data;

        switch (message.type) {
          case 'ready':
            console.log('[FixationWorker] Ready');
            isWorkerReadyRef.current = true; // Set ref synchronously
            setIsWorkerReady(true);
            break;

          case 'result':
            console.log('[FixationWorker] Result received:', {
              ivt: message.fixationIVT ? `(${message.fixationIVT.x.toFixed(0)}, ${message.fixationIVT.y.toFixed(0)})` : 'null',
              idt: message.fixationIDT ? `(${message.fixationIDT.x.toFixed(0)}, ${message.fixationIDT.y.toFixed(0)})` : 'null',
            });

            // Update state with results
            if (enableIVTRef.current) {
              setCurrentFixationIVT(message.fixationIVT || null);
            }
            if (enableIDTRef.current) {
              setCurrentFixationIDT(message.fixationIDT || null);
            }

            pendingProcessRef.current = false;
            break;

          case 'error':
            console.error('[FixationWorker] Error:', message.error);
            pendingProcessRef.current = false;
            break;

          default:
            console.warn('[FixationWorker] Unknown message type:', message);
        }
      };

      worker.onerror = (error) => {
        console.error('[FixationWorker] Worker error:', error);
        pendingProcessRef.current = false;
      };

      workerRef.current = worker;

      // Cleanup on unmount
      return () => {
        console.log('[FixationWorker] Terminating...');
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        isWorkerReadyRef.current = false; // Reset ref synchronously
        setIsWorkerReady(false);
      };
    } catch (error) {
      console.error('[FixationWorker] Failed to create worker:', error);
      isWorkerReadyRef.current = false;
      setIsWorkerReady(false);
    }
  }, []);

  // Process buffer using Web Worker
  const processBuffer = useCallback(() => {
    const worker = workerRef.current;
    const buffer = bufferRef.current;

    if (!worker || !isWorkerReadyRef.current) {
      console.log('[FixationWorker] Worker not ready');
      return;
    }

    if (pendingProcessRef.current) {
      console.log('[FixationWorker] Previous process still pending, skipping...');
      return;
    }

    if (buffer.length < MIN_SAMPLES_FOR_DETECTION) {
      console.log(`[FixationWorker] Buffer too small: ${buffer.length}/${MIN_SAMPLES_FOR_DETECTION} samples`);
      return;
    }

    // Validate buffer duration (defensive check for timestamp issues)
    const bufferDuration = buffer[buffer.length - 1].timestamp - buffer[0].timestamp;
    if (bufferDuration < 100) {
      console.warn(`[FixationWorker] Suspicious buffer duration: ${bufferDuration.toFixed(1)}ms for ${buffer.length} samples - skipping`);
      return;
    }

    const samplingRate = buffer.length / (bufferDuration / 1000);
    console.log(`[FixationWorker] Processing buffer: ${buffer.length} samples, ${bufferDuration.toFixed(0)}ms, ${samplingRate.toFixed(1)} Hz`);

    // Send buffer to worker for processing
    pendingProcessRef.current = true;

    const message: WorkerInputMessage = {
      type: 'process',
      buffer: [...buffer], // Clone to avoid shared memory issues
      enableIVT: enableIVTRef.current,
      enableIDT: enableIDTRef.current,
      oneDegree: oneDegreeRef.current,
    };

    worker.postMessage(message);
  }, []); // No dependencies needed - using refs for all values

  // Process gaze point (called on every gaze result)
  const processGazePoint = useCallback((gazeResult: GazeResult) => {
    // Skip if eyes closed
    if (gazeResult.gazeState === 'closed') {
      return;
    }

    // Convert to pixels
    const x = (gazeResult.normPog[0] + 0.5) * window.innerWidth;
    const y = (gazeResult.normPog[1] + 0.5) * window.innerHeight;

    // Convert timestamp from seconds to milliseconds for kollar-ts
    const point: RawGazeData = {
      timestamp: gazeResult.timestamp * 1000,
      x,
      y,
    };

    // Add to buffer
    bufferRef.current.push(point);

    // Remove old points (keep last 2 seconds)
    const cutoffTime = point.timestamp - BUFFER_DURATION_MS;
    bufferRef.current = bufferRef.current.filter(p => p.timestamp > cutoffTime);

    setBufferSize(bufferRef.current.length);

    // Process periodically (not on every frame)
    const now = Date.now();
    if (now - lastProcessTimeRef.current >= PROCESS_INTERVAL_MS) {
      lastProcessTimeRef.current = now;
      processBuffer();
    }
  }, [processBuffer]);

  // Reset buffer
  const reset = useCallback(() => {
    bufferRef.current = [];
    setCurrentFixationIVT(null);
    setCurrentFixationIDT(null);
    setBufferSize(0);
    pendingProcessRef.current = false;

    // Send reset message to worker
    if (workerRef.current && isWorkerReadyRef.current) {
      const message: WorkerInputMessage = {
        type: 'reset',
      };
      workerRef.current.postMessage(message);
    }
  }, []); // No dependencies needed - using refs

  // Clear fixations when algorithms are disabled
  useEffect(() => {
    if (!enableIVT) {
      setCurrentFixationIVT(null);
    }
    if (!enableIDT) {
      setCurrentFixationIDT(null);
    }
  }, [enableIVT, enableIDT]);

  return {
    currentFixationIVT,
    currentFixationIDT,
    bufferSize,
    processGazePoint,
    reset,
    isWorkerReady,
  };
}
