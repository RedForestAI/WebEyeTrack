/**
 * Video recording hook
 *
 * Records screen content for meaningful fixation overlay
 * Handles 30-minute auto-stop limit
 */

import { useState, useRef, useCallback } from 'react';

const MAX_RECORDING_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

interface UseVideoRecordingReturn {
  isRecording: boolean;
  videoBlob: Blob | null;
  duration: number;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<Blob | null>;
  clearRecording: () => void;
}

export function useVideoRecording(
  videoElement: HTMLVideoElement | null
): UseVideoRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Define stopRecording first so it can be used in startRecording's dependency array
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    // Use mediaRecorder state instead of React state to avoid stale closure issues
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        setVideoBlob(blob);
        setIsRecording(false);

        // Clear intervals and timeouts
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (autoStopTimeoutRef.current) {
          clearTimeout(autoStopTimeoutRef.current);
          autoStopTimeoutRef.current = null;
        }

        // Stop screen stream if it exists
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
          console.log('Screen stream stopped');
        }

        // Calculate duration from ref to avoid stale closure
        const recordingDuration = Date.now() - startTimeRef.current;
        console.log(`Recording stopped. Duration: ${recordingDuration}ms, Size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        resolve(blob);
      };

      mediaRecorder.stop();
    });
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      let stream: MediaStream;

      // Request screen capture
      console.log('Requesting screen capture...');
      try {
        // Use type assertion for screen capture constraints as TypeScript types may be incomplete
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false, // No audio for screen recording
        } as DisplayMediaStreamOptions);
        screenStreamRef.current = stream;
        console.log('Screen capture started');
      } catch (err) {
        console.error('Screen capture failed:', err);
        alert('Screen recording permission denied or not supported.');
        return false;
      }

      // Create MediaRecorder with optimal settings
      let options: MediaRecorderOptions = {};

      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options.mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options.mimeType = 'video/webm;codecs=vp8';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
      }

      const mediaRecorder = new MediaRecorder(stream!, options);

      // Collect chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Handle stop
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: options.mimeType || 'video/webm' });
        setVideoBlob(blob);
        console.log(`Recording stopped. Video size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      };

      // Start recording
      mediaRecorder.start(1000); // Request data every second
      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();
      chunksRef.current = [];
      setIsRecording(true);

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDuration(elapsed);
      }, 1000);

      // Auto-stop after 30 minutes
      autoStopTimeoutRef.current = setTimeout(() => {
        console.log('Auto-stopping recording: 30-minute limit reached');
        stopRecording();
        alert('Recording stopped: 30-minute limit reached');
      }, MAX_RECORDING_DURATION);

      console.log(`Video recording started in screen mode`);
      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return false;
    }
  }, [stopRecording]);

  const clearRecording = useCallback(() => {
    setVideoBlob(null);
    setDuration(0);
    chunksRef.current = [];

    // Clean up screen stream if it exists
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
  }, []);

  return {
    isRecording,
    videoBlob,
    duration,
    startRecording,
    stopRecording,
    clearRecording,
  };
}
