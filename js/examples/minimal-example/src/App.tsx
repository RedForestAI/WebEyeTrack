import "./App.css";
import { useState, useEffect, useRef } from 'react';
import { WebcamClient, WebEyeTrackProxy, type GazeResult } from 'webeyetrack';
import GazeDot from './GazeDot.tsx';
import MemoryCleanupErrorBoundary from './MemoryCleanupErrorBoundary';

function AppContent() {
  const [gaze, setGaze] = useState({ x: 0, y: 0, gazeState: 'closed'});
  const hasInitializedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webcamClientRef = useRef<WebcamClient | null>(null);
  const eyeTrackProxyRef = useRef<WebEyeTrackProxy | null>(null);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    let mounted = true;

    async function startWebEyeTrack() {
      if (!mounted || !videoRef.current) return;

      try {
        const webcamClient = new WebcamClient(videoRef.current.id);
        const webEyeTrackProxy = new WebEyeTrackProxy(webcamClient, {
          workerUrl: '/webeyetrack.worker.js'
        });

        // Store refs for cleanup
        webcamClientRef.current = webcamClient;
        eyeTrackProxyRef.current = webEyeTrackProxy;

        // Define callback for gaze results
        webEyeTrackProxy.onGazeResults = (gazeResult: GazeResult) => {
          if (!mounted) return;

          // Update gaze position and state
          setGaze({
            x: (gazeResult.normPog[0] + 0.5) * window.innerWidth,
            y: (gazeResult.normPog[1] + 0.5) * window.innerHeight,
            gazeState: gazeResult.gazeState
          });
        };

        // Note: WebEyeTrackProxy automatically starts the webcam when the worker is ready
        console.log('WebEyeTrack initialized - waiting for worker to be ready...');
      } catch (error) {
        console.error('Failed to start WebEyeTrack:', error);
      }
    }

    startWebEyeTrack();

    // Cleanup function
    return () => {
      mounted = false;
      hasInitializedRef.current = false; // Reset for StrictMode remounting

      // Dispose resources
      if (webcamClientRef.current) {
        webcamClientRef.current.dispose();
        webcamClientRef.current = null;
      }

      if (eyeTrackProxyRef.current) {
        eyeTrackProxyRef.current.dispose();
        eyeTrackProxyRef.current = null;
      }

      console.log('App cleanup completed');
    };
  }, []); // Empty dependency array to run only on mount/unmount

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        position: 'absolute',
        top: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        color: 'white',
        zIndex: 10
      }}>
        <h1 style={{ fontSize: '2.5rem', margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
          WebEyeTrack Demo
        </h1>
        <p style={{ fontSize: '1.1rem', margin: 0, opacity: 0.9 }}>
          Move your eyes around the screen to see the magenta gaze dot follow
        </p>
      </div>

      {/* Gaze Dot */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100
      }}>
        <GazeDot x={gaze.x} y={gaze.y} gazeState={gaze.gazeState}/>
      </div>

      {/* Webcam Preview */}
      <div style={{
        marginTop: '6rem',
        borderRadius: '1rem',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        border: '4px solid rgba(255, 255, 255, 0.2)',
        transform: 'scale(-1, 1)' // Mirror the webcam for natural viewing
      }}>
        <video
          id='webcam'
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            display: 'block',
            width: '640px',
            height: '480px',
            objectFit: 'cover'
          }}
        />
      </div>

      {/* Instructions */}
      <div style={{
        position: 'absolute',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        textAlign: 'center',
        color: 'white',
        background: 'rgba(0, 0, 0, 0.3)',
        padding: '1rem 2rem',
        borderRadius: '0.5rem',
        backdropFilter: 'blur(10px)',
        maxWidth: '600px'
      }}>
        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>
          <strong>How it works:</strong> WebEyeTrack uses your webcam and facial landmarks
          to predict where you're looking on the screen. The magenta dot shows your estimated gaze point.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const handleCleanup = () => {
    console.log('Error boundary triggered cleanup');
  };

  return (
    <MemoryCleanupErrorBoundary onCleanup={handleCleanup}>
      <AppContent />
    </MemoryCleanupErrorBoundary>
  );
}
