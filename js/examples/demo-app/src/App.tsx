import React, { useState, useEffect, useRef } from 'react';
import { WebcamClient, WebEyeTrackProxy, GazeResult } from 'webeyetrack';
import GazeDot from './GazeDot.jsx';
import DebugOverlay from './DebugOverlay';
import { drawMesh } from './drawMesh';
import MemoryCleanupErrorBoundary from './MemoryCleanupErrorBoundary';
import CalibrationOverlay from './components/CalibrationOverlay';
import ScreenCalibrationDialog from './components/ScreenCalibrationDialog';
import RecordingControls from './components/RecordingControls';
import RealtimeFixationOverlay from './components/RealtimeFixationOverlay';
import HeatmapOverlay from './components/HeatmapOverlay';
import AnalysisProgress from './components/AnalysisProgress';
import GazeAnalysisDashboard from './components/GazeAnalysisDashboard';
import { useVideoRecording } from './hooks/useVideoRecording';
import { useGazeRecording } from './hooks/useGazeRecording';
import { useRealtimeFixations } from './hooks/useRealtimeFixations';
import { analyzeAllAlgorithms } from './utils/fixationAnalysis';
import { useGazeStore } from './stores/gazeStore';
import type { RawGazeData, RecordingSession } from './types/recording';
import type { AnalysisSession, AnalysisProgress as AnalysisProgressType } from './types/analysis';

/**
 * TODO: REFACTORING NEEDED
 *
 * Current component is 638 lines - should be split into smaller, more maintainable components.
 *
 * Suggested refactoring:
 * 1. Extract RecordingManager component (lines 266-392):
 *    - Handles handleStartRecording, handleStopRecording
 *    - Manages recording state and analysis workflow
 *    - Reduces complexity by isolating recording logic
 *
 * 2. Extract CalibrationManager component (lines 394-414):
 *    - Handles calibration flow and screen calibration
 *    - Manages calibration state
 *
 * 3. Extract MainViewLayout component (lines 439-624):
 *    - Layout for camera, face mesh, eye patch, debug overlays
 *    - UI state management (show/hide toggles)
 *
 * 4. Extract GazeResultsHandler (lines 108-217):
 *    - Process gaze results callback
 *    - Update stores and local state
 *    - Manage heatmap and fixation detection
 *
 * 5. Add component tests:
 *    - Test calibration flow
 *    - Test recording start/stop
 *    - Test analysis pipeline
 *    - Test dashboard open/close
 *    - Add React Testing Library tests
 *
 * Target: Each component <300 lines, fully tested
 */
function AppContent() {
  const [gaze, setGaze] = useState({ x: 0, y: 0, gazeState: 'closed'});
  const [debugData, setDebugData] = useState({});
  const [perfData, setPerfData] = useState({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Store selectors (must be at top level, not conditional)
  const showHeatmap = useGazeStore((state) => state.showHeatmap);

  // Toggles
  const [showCamera, setShowCamera] = useState(true);
  const [showFaceMesh, setShowFaceMesh] = useState(true);
  const [showEyePatch, setShowEyePatch] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showScreenCalibration, setShowScreenCalibration] = useState(false);
  const [oneDegree, setOneDegree] = useState<number>(40); // Default
  const [screenPreset, setScreenPreset] = useState<string>('desktop24');
  const [recordingSession, setRecordingSession] = useState<RecordingSession | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars

  // Real-time fixation detection toggles
  const [enableRealtimeIVT, setEnableRealtimeIVT] = useState(false);
  const [enableRealtimeIDT, setEnableRealtimeIDT] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressType>({
    stage: '',
    percent: 0,
  });
  const [analysisSession, setAnalysisSession] = useState<AnalysisSession | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const hasInitializedRef = useRef(false);
  const hasCanvasSizeRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const eyePatchRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webcamClientRef = useRef<WebcamClient | null>(null);
  const eyeTrackProxyRef = useRef<WebEyeTrackProxy | null>(null);
  const showDashboardRef = useRef(false);

  // Recording hooks
  const videoRecording = useVideoRecording(videoRef.current);
  const gazeRecording = useGazeRecording();

  // Real-time fixation detection
  const realtimeFixations = useRealtimeFixations(
    enableRealtimeIVT,
    enableRealtimeIDT,
    oneDegree
  );

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    let mounted = true;

    async function startWebEyeTrack() {
      if (!mounted || !videoRef.current || !canvasRef.current) return;

      videoRef.current.onloadedmetadata = () => {
        if (!hasCanvasSizeRef.current && videoRef.current) {
          hasCanvasSizeRef.current = true;

          // Set canvas size based on actual video dimensions
          const width = videoRef.current.videoWidth;
          const height = videoRef.current.videoHeight;
          canvasRef.current!.width = width;
          canvasRef.current!.height = height;

          console.log(`Canvas size set to: ${width}x${height}`);
        }
      }

      const webcamClient = new WebcamClient(videoRef.current.id);
      const webEyeTrackProxy = new WebEyeTrackProxy(webcamClient, {
        workerUrl: process.env.PUBLIC_URL + '/webeyetrack.worker.js',
        modelPath: process.env.PUBLIC_URL + '/web/model.json'
      });

      // Store refs for cleanup
      webcamClientRef.current = webcamClient;
      eyeTrackProxyRef.current = webEyeTrackProxy;

      // Define callback for gaze results
      webEyeTrackProxy.onGazeResults = (gazeResult: GazeResult) => {
        if (!mounted) return;

        // Ensure gazeResult is not null or undefined
        if (!gazeResult) {
          console.error("Gaze result is null or undefined");
          return;
        }

        // Skip all processing if dashboard is open (prevents re-renders during analysis view)
        // Dashboard state is checked via ref to avoid stale closure
        if (showDashboardRef.current) {
          return;
        }

        // Get store instance (outside React render cycle)
        const store = useGazeStore.getState();

        // Convert to screen coordinates
        const rawX = (gazeResult.normPog[0] + 0.5) * window.innerWidth;
        const rawY = (gazeResult.normPog[1] + 0.5) * window.innerHeight;

        // Apply temporal smoothing (exponential moving average)
        const SMOOTHING_FACTOR = 0.3;
        store.updateSmoothedGaze(rawX, rawY, SMOOTHING_FACTOR);
        const smoothedGaze = useGazeStore.getState().smoothedGaze;

        // Update current gaze state in store
        store.setCurrentGaze({
          x: rawX,
          y: rawY,
          gazeState: gazeResult.gazeState as 'open' | 'closed' | 'unknown',
          normPog: gazeResult.normPog as [number, number],
        });

        // Update local state for components that still use it
        setGaze({
          x: smoothedGaze.x,
          y: smoothedGaze.y,
          gazeState: gazeResult.gazeState
        });

        // Update debug and perf data in store
        store.setDebugData({
          gazeState: gazeResult.gazeState,
          normPog: gazeResult.normPog,
          headVector: gazeResult.headVector,
          faceOrigin3D: gazeResult.faceOrigin3D,
        });
        store.setPerfData(gazeResult.durations);

        // Update local debug state for components
        setDebugData({
          gazeState: gazeResult.gazeState,
          normPog: gazeResult.normPog,
          headVector: gazeResult.headVector,
          faceOrigin3D: gazeResult.faceOrigin3D,
        });
        setPerfData(gazeResult.durations);

        // Conditional data buffering: Only when recording is active
        if (store.recording.isRecording) {
          // Record gaze point for post-analysis
          gazeRecording.recordGazePoint(gazeResult);

          // Create raw gaze data point
          const point: RawGazeData = {
            timestamp: gazeResult.timestamp * 1000,
            x: rawX,
            y: rawY,
          };

          // Add to store buffer
          store.addGazePoint(point);
          store.incrementSampleCount();
        }

        // Update heatmap (O(1) grid operation)
        if (store.showHeatmap) {
          const GRID_SIZE = 50;
          const col = Math.floor(smoothedGaze.x / GRID_SIZE);
          const row = Math.floor(smoothedGaze.y / GRID_SIZE);

          const gridWidth = Math.ceil(window.innerWidth / GRID_SIZE);
          const gridHeight = Math.ceil(window.innerHeight / GRID_SIZE);

          if (col >= 0 && col < gridWidth && row >= 0 && row < gridHeight) {
            store.updateHeatmap({ row, col, weight: 5 });
          }
        }

        // Process for real-time fixation detection (now in Web Worker)
        realtimeFixations.processGazePoint(gazeResult);

        // Show EyePatch and Face Mesh
        if (eyePatchRef.current && gazeResult.eyePatch) {
          eyePatchRef.current!.width = gazeResult.eyePatch.width;
          eyePatchRef.current!.height = gazeResult.eyePatch.height;
          const eyePatchCtx = eyePatchRef.current!.getContext('2d');
          if (eyePatchCtx) {
            eyePatchCtx.clearRect(0, 0, eyePatchRef.current!.width, eyePatchRef.current!.height);
            eyePatchCtx.putImageData(gazeResult.eyePatch, 0, 0);
          }
        }

        // Only draw mesh if canvas is available (not shown when dashboard is active)
        if (canvasRef.current) {
          drawMesh(gazeResult, canvasRef.current);
        }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run only on mount/unmount

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  // Sync showDashboard state with ref to avoid stale closures
  useEffect(() => {
    showDashboardRef.current = showDashboard;
  }, [showDashboard]);

  // Recording handlers
  const handleStartRecording = async () => {
    // Start video recording (always screen mode)
    const videoStarted = await videoRecording.startRecording();
    if (!videoStarted) {
      alert(`Failed to start screen recording. Please check permissions.`);
      return;
    }

    // Start gaze recording
    gazeRecording.startRecording({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      oneDegree,
      screenPreset,
      recordingMode: 'screen',
    });

    // Start recording in store
    const store = useGazeStore.getState();
    store.startRecording({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      oneDegree,
      screenPreset,
      recordingMode: 'screen',
    });
    store.setIsRunning(true);

    console.log(`Recording started in screen mode`);
  };

  const handleStopRecording = async () => {
    // Stop video recording
    const videoBlob = await videoRecording.stopRecording();
    if (!videoBlob) {
      console.error('Failed to get video blob');
      return;
    }

    // Stop gaze recording
    const { gazeData, metadata } = gazeRecording.stopRecording();

    // Stop recording in store
    const store = useGazeStore.getState();
    store.stopRecording();
    store.setIsRunning(false);

    // Create recording session
    const session: RecordingSession = {
      metadata,
      gazeData,
      videoBlob,
    };

    setRecordingSession(session);
    console.log('Recording stopped', {
      duration: metadata.duration,
      samples: metadata.sampleCount,
      videoSize: videoBlob.size,
    });

    // Start analysis
    setIsAnalyzing(true);

    try {
      // Run all three algorithms
      const results = await analyzeAllAlgorithms(
        gazeData,
        oneDegree,
        (stage, percent, algorithm) => {
          setAnalysisProgress({ stage, percent, algorithm });
        }
      );

      // Create blob URL once here (not in child components)
      const videoUrl = URL.createObjectURL(videoBlob);
      console.log('Created blob URL in App.tsx:', videoUrl);

      // Create analysis session
      const analysisSession: AnalysisSession = {
        recordingMetadata: {
          startTime: metadata.startTime,
          endTime: metadata.endTime!,
          duration: metadata.duration!,
          sampleCount: metadata.sampleCount,
          screenWidth: metadata.screenWidth,
          screenHeight: metadata.screenHeight,
          oneDegree: metadata.oneDegree,
          screenPreset: metadata.screenPreset,
          recordingMode: metadata.recordingMode,
        },
        analysisResults: results,
        videoBlob,
        videoUrl,
      };

      setAnalysisSession(analysisSession);
      setIsAnalyzing(false);

      console.log('Analysis complete!', {
        i2mc: results.i2mc.fixations.length,
        ivt: results.ivt.fixations.length,
        idt: results.idt.fixations.length,
        saccades: results.ivt.saccades?.length || 0,
        videoBlob: videoBlob ? `${(videoBlob.size / 1024 / 1024).toFixed(2)} MB` : 'null',
      });

      // Validate video blob before showing dashboard
      if (!videoBlob || videoBlob.size === 0) {
        console.error('Video blob is missing or empty!');
        alert('Recording failed: No video data available. Please try recording again.');
        setIsAnalyzing(false);
        return;
      }

      // Show dashboard
      console.log('Opening dashboard...');
      showDashboardRef.current = true;
      setShowDashboard(true);

    } catch (error) {
      console.error('Analysis failed:', error);
      setIsAnalyzing(false);
      alert('Analysis failed. Please check the console for details.');
    }
  };

  const handleScreenCalibrationComplete = (calculatedOneDegree: number, preset: string) => {
    setOneDegree(calculatedOneDegree);
    setScreenPreset(preset);
    setShowScreenCalibration(false);

    console.log(`Screen calibration complete: ${calculatedOneDegree.toFixed(2)} px/degree (${preset})`);

    // Show calibration after screen calibration
    setShowCalibration(true);
  };

  const handleCalibrationStart = () => {
    // Show screen calibration first if not done
    if (oneDegree === 40 && screenPreset === 'desktop24') {
      // Default values - need calibration
      setShowScreenCalibration(true);
    } else {
      // Already calibrated
      setShowCalibration(true);
    }
  };

  // Show dashboard if analysis is complete
  if (showDashboard && analysisSession) {
    return (
      <GazeAnalysisDashboard
        session={analysisSession}
        onClose={() => {
          // Revoke blob URL to free memory
          if (analysisSession.videoUrl) {
            console.log('Revoking blob URL on dashboard close:', analysisSession.videoUrl);
            URL.revokeObjectURL(analysisSession.videoUrl);
          }

          setShowDashboard(false);
          showDashboardRef.current = false;
          setAnalysisSession(null);
          // Clear recordings
          videoRecording.clearRecording();
          gazeRecording.clearRecording();
        }}
      />
    );
  }

  return (
    <>
      {/* Screen Calibration Dialog */}
      {showScreenCalibration && (
        <ScreenCalibrationDialog
          onComplete={handleScreenCalibrationComplete}
          onCancel={() => setShowScreenCalibration(false)}
        />
      )}

      {/* Calibration Overlay */}
      {showCalibration && eyeTrackProxyRef.current && (
        <CalibrationOverlay
          tracker={eyeTrackProxyRef.current}
          onComplete={() => {
            console.log('Calibration completed successfully');
            setShowCalibration(false);
          }}
          onCancel={() => {
            console.log('Calibration cancelled');
            setShowCalibration(false);
          }}
        />
      )}

      {/* Analysis Progress */}
      {isAnalyzing && (
        <AnalysisProgress
          stage={analysisProgress.stage}
          percent={analysisProgress.percent}
          algorithm={analysisProgress.algorithm}
        />
      )}

      {/* Recording Controls */}
      <RecordingControls
        isRecording={videoRecording.isRecording}
        duration={videoRecording.duration}
        sampleCount={gazeRecording.sampleCount}
        maxDuration={30 * 60 * 1000} // 30 minutes
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
      />

      {/* Burger Menu */}
      <div className="flex items-center fixed top-0 left-0 w-full h-12 bg-white z-50">
        <div ref={menuRef} className="relative">
          <button
            className="ml-1 p-2 h-10 border-2 border-gray-300 rounded-md shadow-md md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            ☰
          </button>

          {/* Dropdown */}
          <div
            className={`absolute w-48 top-12 left-0 bg-white p-4 rounded-md shadow-lg space-y-2 transition-opacity duration-200 ${
              menuOpen ? 'block' : 'hidden'
            } md:w-full md:block md:static md:shadow-none md:pl-2 md:p-0 md:space-y-0 md:flex md:gap-4`}
          >
            <label className="block md:inline-flex items-center gap-2">
              <input type="checkbox" checked={showCamera} onChange={() => setShowCamera(!showCamera)} />
              Show Camera
            </label>
            <label className="block md:inline-flex items-center gap-2">
              <input type="checkbox" checked={showFaceMesh} onChange={() => setShowFaceMesh(!showFaceMesh)} />
              Show Face Mesh
            </label>
            <label className="block md:inline-flex items-center gap-2">
              <input type="checkbox" checked={showEyePatch} onChange={() => setShowEyePatch(!showEyePatch)} />
              Show Eye Patch
            </label>
            <label className="block md:inline-flex items-center gap-2">
              <input type="checkbox" checked={showDebug} onChange={() => setShowDebug(!showDebug)} />
              Show Debug Data
            </label>

            <label className="block md:inline-flex items-center gap-2 text-purple-600">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => {
                  const store = useGazeStore.getState();
                  store.setShowHeatmap(e.target.checked);
                }}
              />
              Live Heatmap
              <span className="text-xs text-gray-500">(Optimized)</span>
            </label>

            <label className="block md:inline-flex items-center gap-2 text-blue-600">
              <input
                type="checkbox"
                checked={enableRealtimeIVT}
                onChange={() => setEnableRealtimeIVT(!enableRealtimeIVT)}
              />
              Real-time I-VT
              <span className="text-xs text-orange-600 font-semibold">(May impact performance)</span>
            </label>
            <label className="block md:inline-flex items-center gap-2 text-yellow-600">
              <input
                type="checkbox"
                checked={enableRealtimeIDT}
                onChange={() => setEnableRealtimeIDT(!enableRealtimeIDT)}
              />
              Real-time I-DT
              <span className="text-xs text-orange-600 font-semibold">(May impact performance)</span>
            </label>
          </div>
        </div>

        {/* Calibrate Button */}
        <button
          className="ml-auto mr-2 px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700 transition font-semibold"
          onClick={handleCalibrationStart}
          disabled={!eyeTrackProxyRef.current || videoRecording.isRecording}
        >
          Calibrate
        </button>
      </div>

      {/* Gaze Dot */}
      <div className="absolute left-0 right-0 w-full h-full z-100 pointer-events-none">
        <GazeDot x={gaze.x} y={gaze.y} gazeState={gaze.gazeState}/>
      </div>

      {/* Live Heatmap Overlay */}
      <HeatmapOverlay />

      {/* Real-time Fixation Overlay */}
      <RealtimeFixationOverlay
        fixationIVT={realtimeFixations.currentFixationIVT}
        fixationIDT={realtimeFixations.currentFixationIDT}
        showIVT={enableRealtimeIVT}
        showIDT={enableRealtimeIDT}
      />

      {/* Main layout */}
      <div className="flex flex-col w-full bg-black" style={{height: '100vh', overflow: 'hidden'}}>
        {/* Spacer for fixed menu */}
        <div className="h-12 flex-shrink-0"></div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-col md:flex-row md:justify-between">
          <div className="w-full relative md:w-1/5">
            <canvas
              ref={canvasRef}
              className="w-full h-full absolute z-20"
              hidden={!showFaceMesh}
            />
            <video
              id='webcam'
              ref={videoRef}
              autoPlay
              playsInline
              // hidden={!showCamera}
              // className="w-full z-10"
              className={`w-full z-10 ${showCamera ? '' : 'opacity-0'}`}
              
            />
          </div>

          <div className="flex items-center justify-center">
            <canvas
              ref={eyePatchRef}
              className="max-w-full h-auto z-20"
              hidden={!showEyePatch}
            />
          </div>

        </div>

          {/* ✅ Show the debug data overlay */}
          <div className="flex flex-col items-center md:flex-row md:justify-between m-4">
            { showDebug && (
              <>
                <DebugOverlay data={debugData}/>
                <DebugOverlay data={perfData}/>
              </>
            )
            }
          </div>
        </div>
      </div>
    </>
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
