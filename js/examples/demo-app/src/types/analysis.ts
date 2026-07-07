/**
 * Type definitions for gaze analysis results
 */

import type { Fixation, Saccade, FilteredGazeData } from 'kollar-ts';

/**
 * Results from all three fixation detection algorithms
 */
export interface AnalysisResults {
  i2mc: {
    fixations: Fixation[];
    filteredGaze: FilteredGazeData[];
  };
  ivt: {
    fixations: Fixation[];
    saccades?: Saccade[];
    filteredGaze: FilteredGazeData[];
  };
  idt: {
    fixations: Fixation[];
    filteredGaze: FilteredGazeData[];
  };
  metadata: {
    duration: number;
    sampleCount: number;
    oneDegree: number;
    screenWidth: number;
    screenHeight: number;
  };
}

/**
 * Progress update during analysis
 */
export interface AnalysisProgress {
  stage: string;
  percent: number;
  algorithm?: string;
}

/**
 * Complete analysis session including recording and results
 */
export interface AnalysisSession {
  recordingMetadata: {
    startTime: number;
    endTime: number;
    duration: number;
    sampleCount: number;
    screenWidth: number;
    screenHeight: number;
    oneDegree: number;
    screenPreset: string;
    recordingMode: 'screen';
  };
  analysisResults: AnalysisResults;
  videoBlob: Blob;
  videoUrl: string;  // Blob URL created once in parent component
}
