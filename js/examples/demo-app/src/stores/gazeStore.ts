/**
 * Zustand Store for Gaze Tracking State Management
 *
 * Centralizes state to minimize React re-renders and improve performance.
 * Based on the reference implementation from proctoring-sdk dashboard.
 */

import { create } from 'zustand';
import type { RawGazeData, RecordingMetadata } from '../types/recording';

/**
 * Heatmap cell data structure (sparse representation)
 */
export interface HeatmapCell {
  row: number;
  col: number;
  weight: number;
}

/**
 * Current gaze position state
 */
export interface GazeState {
  x: number;
  y: number;
  gazeState: 'open' | 'closed' | 'unknown';
  normPog: [number, number];
}

/**
 * Smoothed gaze position (for stable UI rendering)
 */
export interface SmoothedGaze {
  x: number;
  y: number;
}

/**
 * Recording state
 */
export interface RecordingState {
  isRecording: boolean;
  startTime: number | null;
  duration: number;
  sampleCount: number;
  gazeBuffer: RawGazeData[];
  metadata: RecordingMetadata | null;
}

/**
 * UI state
 */
export interface UIState {
  showCamera: boolean;
  showFaceMesh: boolean;
  showEyePatch: boolean;
  showDebug: boolean;
  showHeatmap: boolean;
  menuOpen: boolean;
  recordingMode: 'screen';
}

/**
 * Main store interface
 */
interface GazeStore {
  // Gaze state
  currentGaze: GazeState;
  smoothedGaze: SmoothedGaze;
  debugData: Record<string, unknown>;
  perfData: Record<string, unknown>;

  // Heatmap state (sparse grid)
  heatmapData: HeatmapCell[];
  showHeatmap: boolean;
  isRunning: boolean;

  // Recording state
  recording: RecordingState;

  // UI state
  ui: UIState;

  // Gaze actions
  setCurrentGaze: (gaze: Partial<GazeState>) => void;
  updateSmoothedGaze: (x: number, y: number, smoothingFactor: number) => void;
  setDebugData: (data: Record<string, unknown>) => void;
  setPerfData: (data: Record<string, unknown>) => void;

  // Heatmap actions
  updateHeatmap: (cell: HeatmapCell) => void;
  clearHeatmap: () => void;
  setShowHeatmap: (show: boolean) => void;
  setIsRunning: (running: boolean) => void;

  // Recording actions
  startRecording: (config: {
    screenWidth: number;
    screenHeight: number;
    oneDegree: number;
    screenPreset: string;
    recordingMode: 'screen';
  }) => void;
  stopRecording: () => { gazeData: RawGazeData[]; metadata: RecordingMetadata };
  addGazePoint: (point: RawGazeData) => void;
  incrementSampleCount: () => void;
  clearRecording: () => void;

  // UI actions
  setUIState: (state: Partial<UIState>) => void;
  toggleMenu: () => void;

  // Reset all
  reset: () => void;
}

const SMOOTHING_FACTOR = 0.3;

export const useGazeStore = create<GazeStore>((set, get) => ({
  // Initial state
  currentGaze: {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    gazeState: 'unknown',
    normPog: [0, 0],
  },
  smoothedGaze: {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  },
  debugData: {},
  perfData: {},

  heatmapData: [],
  showHeatmap: false,
  isRunning: false,

  recording: {
    isRecording: false,
    startTime: null,
    duration: 0,
    sampleCount: 0,
    gazeBuffer: [],
    metadata: null,
  },

  ui: {
    showCamera: true,
    showFaceMesh: true,
    showEyePatch: true,
    showDebug: true,
    showHeatmap: false,
    menuOpen: false,
    recordingMode: 'screen',
  },

  // Gaze actions
  setCurrentGaze: (gaze) =>
    set((state) => ({
      currentGaze: { ...state.currentGaze, ...gaze },
    })),

  updateSmoothedGaze: (rawX, rawY, smoothingFactor = SMOOTHING_FACTOR) =>
    set((state) => ({
      smoothedGaze: {
        x: state.smoothedGaze.x * (1 - smoothingFactor) + rawX * smoothingFactor,
        y: state.smoothedGaze.y * (1 - smoothingFactor) + rawY * smoothingFactor,
      },
    })),

  setDebugData: (data) => set({ debugData: data }),
  setPerfData: (data) => set({ perfData: data }),

  // Heatmap actions
  updateHeatmap: (cell) =>
    set((state) => {
      // Find existing cell in sparse array
      const existingIndex = state.heatmapData.findIndex(
        (c) => c.row === cell.row && c.col === cell.col
      );

      if (existingIndex !== -1) {
        // Update existing cell weight
        const newHeatmapData = [...state.heatmapData];
        newHeatmapData[existingIndex] = {
          ...newHeatmapData[existingIndex],
          weight: newHeatmapData[existingIndex].weight + cell.weight,
        };
        return { heatmapData: newHeatmapData };
      } else {
        // Add new cell
        return { heatmapData: [...state.heatmapData, cell] };
      }
    }),

  clearHeatmap: () => set({ heatmapData: [] }),
  setShowHeatmap: (show) => set({ showHeatmap: show }),
  setIsRunning: (running) => set({ isRunning: running }),

  // Recording actions
  startRecording: (config) =>
    set((state) => ({
      recording: {
        ...state.recording,
        isRecording: true,
        startTime: Date.now(),
        duration: 0,
        sampleCount: 0,
        gazeBuffer: [],
        metadata: {
          startTime: Date.now(),
          sampleCount: 0,
          screenWidth: config.screenWidth,
          screenHeight: config.screenHeight,
          oneDegree: config.oneDegree,
          screenPreset: config.screenPreset,
          recordingMode: config.recordingMode,
        },
      },
    })),

  stopRecording: () => {
    const state = get();
    const endTime = Date.now();
    const duration = state.recording.startTime
      ? endTime - state.recording.startTime
      : 0;

    const metadata: RecordingMetadata = {
      ...state.recording.metadata!,
      endTime,
      duration,
      sampleCount: state.recording.sampleCount,
    };

    // Return data and update state
    const result = {
      gazeData: [...state.recording.gazeBuffer],
      metadata,
    };

    set((state) => ({
      recording: {
        ...state.recording,
        isRecording: false,
      },
    }));

    return result;
  },

  addGazePoint: (point) =>
    set((state) => ({
      recording: {
        ...state.recording,
        gazeBuffer: [...state.recording.gazeBuffer, point],
      },
    })),

  incrementSampleCount: () =>
    set((state) => ({
      recording: {
        ...state.recording,
        sampleCount: state.recording.sampleCount + 1,
      },
    })),

  clearRecording: () =>
    set((state) => ({
      recording: {
        isRecording: false,
        startTime: null,
        duration: 0,
        sampleCount: 0,
        gazeBuffer: [],
        metadata: null,
      },
    })),

  // UI actions
  setUIState: (uiState) =>
    set((state) => ({
      ui: { ...state.ui, ...uiState },
    })),

  toggleMenu: () =>
    set((state) => ({
      ui: { ...state.ui, menuOpen: !state.ui.menuOpen },
    })),

  // Reset all
  reset: () =>
    set({
      currentGaze: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        gazeState: 'unknown',
        normPog: [0, 0],
      },
      smoothedGaze: {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      },
      debugData: {},
      perfData: {},
      heatmapData: [],
      showHeatmap: false,
      isRunning: false,
      recording: {
        isRecording: false,
        startTime: null,
        duration: 0,
        sampleCount: 0,
        gazeBuffer: [],
        metadata: null,
      },
    }),
}));
