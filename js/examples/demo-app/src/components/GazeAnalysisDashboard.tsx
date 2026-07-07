/**
 * Gaze Analysis Dashboard
 *
 * Main interface for viewing recorded video with fixation overlays
 * Displays results from all three algorithms (I2MC, I-VT, I-DT)
 * Includes controls for toggling algorithms and viewing modes
 */

import React, { useState, useRef, useCallback } from 'react';
import type { AnalysisSession } from '../types/analysis';
import VideoPlayerWithOverlay from './VideoPlayerWithOverlay';
import HeatmapVisualization from './HeatmapVisualization';
import ScanpathVisualization from './ScanpathVisualization';
import MetricsPanel from './MetricsPanel';
import { exportSessionAsJSON, exportMetricsAsCSV, downloadVideo } from '../utils/dataExport';

type ViewMode = 'fixations' | 'heatmap' | 'scanpath' | 'metrics';

interface GazeAnalysisDashboardProps {
  session: AnalysisSession;
  onClose: () => void;
}

export default function GazeAnalysisDashboard({
  session,
  onClose,
}: GazeAnalysisDashboardProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('fixations');

  // Algorithm visibility toggles (for fixations view)
  const [showI2MC, setShowI2MC] = useState(true);
  const [showIVT, setShowIVT] = useState(true);
  const [showIDT, setShowIDT] = useState(true);
  const [showSaccades, setShowSaccades] = useState(true);

  // Algorithm selection for heatmap and scanpath views
  const [heatmapAlgorithm, setHeatmapAlgorithm] = useState<'i2mc' | 'ivt' | 'idt' | 'all'>('all');
  const [scanpathAlgorithm, setScanpathAlgorithm] = useState<'i2mc' | 'ivt' | 'idt'>('i2mc');

  const videoRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Play/pause handler for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handlePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // Export handlers
  const handleExportJSON = useCallback(() => {
    exportSessionAsJSON(session);
  }, [session]);

  const handleExportCSV = useCallback(() => {
    exportMetricsAsCSV(session);
  }, [session]);

  const handleDownloadVideo = useCallback(() => {
    downloadVideo(session.videoBlob);
  }, [session.videoBlob]);

  // Calculate summary statistics
  const stats = {
    i2mc: session.analysisResults.i2mc.fixations.length,
    ivt: session.analysisResults.ivt.fixations.length,
    idt: session.analysisResults.idt.fixations.length,
    saccades: session.analysisResults.ivt.saccades?.length || 0,
    duration: (session.recordingMetadata.duration / 1000).toFixed(1),
    samples: session.recordingMetadata.sampleCount,
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold">Gaze Analysis Dashboard</h1>
            <p className="text-sm text-gray-400">
              Recording: {stats.duration}s | {stats.samples.toLocaleString()} samples
            </p>
          </div>

          {/* View Mode Switcher */}
          <div className="flex gap-2 ml-8">
            <button
              onClick={() => setViewMode('fixations')}
              className={`px-4 py-2 rounded font-semibold text-sm transition ${
                viewMode === 'fixations'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Fixations
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-4 py-2 rounded font-semibold text-sm transition ${
                viewMode === 'heatmap'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Heatmap
            </button>
            <button
              onClick={() => setViewMode('scanpath')}
              className={`px-4 py-2 rounded font-semibold text-sm transition ${
                viewMode === 'scanpath'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Scanpath
            </button>
            <button
              onClick={() => setViewMode('metrics')}
              className={`px-4 py-2 rounded font-semibold text-sm transition ${
                viewMode === 'metrics'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Metrics
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition"
        >
          ✕ Close
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Visualization Area */}
        <div className="flex-1 relative bg-black overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
            {viewMode === 'fixations' && (
              <VideoPlayerWithOverlay
                videoUrl={session.videoUrl}
                analysisResults={session.analysisResults}
                currentTime={currentTime}
                onTimeUpdate={handleTimeUpdate}
                showI2MC={showI2MC}
                showIVT={showIVT}
                showIDT={showIDT}
                showSaccades={showSaccades}
                videoRef={videoRef}
              />
            )}

            {viewMode === 'heatmap' && (
              <HeatmapVisualization
                analysisResults={session.analysisResults}
                width={session.recordingMetadata.screenWidth}
                height={session.recordingMetadata.screenHeight}
                selectedAlgorithm={heatmapAlgorithm}
                onAlgorithmChange={setHeatmapAlgorithm}
              />
            )}

            {viewMode === 'scanpath' && (
              <ScanpathVisualization
                analysisResults={session.analysisResults}
                width={session.recordingMetadata.screenWidth}
                height={session.recordingMetadata.screenHeight}
                selectedAlgorithm={scanpathAlgorithm}
                onAlgorithmChange={setScanpathAlgorithm}
              />
            )}

            {viewMode === 'metrics' && (
              <MetricsPanel
                session={session}
                onExportJSON={handleExportJSON}
                onExportCSV={handleExportCSV}
              />
            )}
          </div>
        </div>

        {/* Control Panel */}
        <div className="w-full md:w-80 bg-gray-900 text-white p-4 overflow-y-auto border-t md:border-t-0 md:border-l border-gray-700">
          <h2 className="text-lg font-bold mb-4">Controls</h2>

          {/* Algorithm Toggles (Fixations View Only) */}
          {viewMode === 'fixations' && (
            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Algorithms</h3>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={showI2MC}
                  onChange={() => setShowI2MC(!showI2MC)}
                  className="w-5 h-5"
                />
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                  <span className="group-hover:text-green-400 transition">
                    I2MC ({stats.i2mc} fixations)
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={showIVT}
                  onChange={() => setShowIVT(!showIVT)}
                  className="w-5 h-5"
                />
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                  <span className="group-hover:text-blue-400 transition">
                    I-VT ({stats.ivt} fixations)
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={showIDT}
                  onChange={() => setShowIDT(!showIDT)}
                  className="w-5 h-5"
                />
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>
                  <span className="group-hover:text-yellow-400 transition">
                    I-DT ({stats.idt} fixations)
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={showSaccades}
                  onChange={() => setShowSaccades(!showSaccades)}
                  className="w-5 h-5"
                />
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
                  <span className="group-hover:text-purple-400 transition">
                    Saccades ({stats.saccades})
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Quick Stats */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Statistics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Duration:</span>
                <span className="font-mono">{stats.duration}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Samples:</span>
                <span className="font-mono">{stats.samples.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Sampling Rate:</span>
                <span className="font-mono">
                  {(stats.samples / parseFloat(stats.duration)).toFixed(0)} Hz
                </span>
              </div>
            </div>
          </div>

          {/* Video Download */}
          {viewMode === 'fixations' && (
            <div className="mt-4">
              <button
                onClick={handleDownloadVideo}
                className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded transition text-sm font-semibold"
              >
                Download Video
              </button>
            </div>
          )}

          {/* Legend */}
          {viewMode === 'fixations' && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Legend</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span>I2MC - Most robust (clustering)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span>I-VT - Velocity-based</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span>I-DT - Dispersion-based</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span>Saccades - Rapid eye movements</span>
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="mt-6 text-xs text-gray-500">
            {viewMode === 'fixations' && (
              <p>
                💡 Tip: Use the video timeline to scrub through the recording.
                Circle size indicates fixation duration.
              </p>
            )}
            {viewMode === 'heatmap' && (
              <p>
                💡 Tip: Warmer colors (red/yellow) indicate areas with more visual attention.
                Choose algorithm or combine all three.
              </p>
            )}
            {viewMode === 'scanpath' && (
              <p>
                💡 Tip: Numbers show fixation sequence. Arrows show saccade direction.
                Circle size indicates duration.
              </p>
            )}
            {viewMode === 'metrics' && (
              <p>
                💡 Tip: Compare algorithm performance. Export data for further analysis
                in your preferred tools.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
