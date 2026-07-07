/**
 * Data Export Utility
 *
 * Exports analysis results in various formats (JSON, CSV)
 * Includes full dataset and metrics-only exports
 */

import type { AnalysisSession } from '../types/analysis';
import { calculateComparisonMetrics } from './metricsCalculator';

/**
 * Export full analysis session as JSON
 */
export function exportSessionAsJSON(session: AnalysisSession): void {
  const data = {
    metadata: session.recordingMetadata,
    results: {
      i2mc: {
        fixations: session.analysisResults.i2mc.fixations,
        filteredGaze: session.analysisResults.i2mc.filteredGaze,
      },
      ivt: {
        fixations: session.analysisResults.ivt.fixations,
        saccades: session.analysisResults.ivt.saccades,
        filteredGaze: session.analysisResults.ivt.filteredGaze,
      },
      idt: {
        fixations: session.analysisResults.idt.fixations,
        filteredGaze: session.analysisResults.idt.filteredGaze,
      },
      metadata: session.analysisResults.metadata,
    },
    exportedAt: new Date().toISOString(),
  };

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gaze-analysis-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export metrics as CSV
 */
export function exportMetricsAsCSV(session: AnalysisSession): void {
  const metrics = calculateComparisonMetrics(
    session.analysisResults.i2mc.fixations,
    session.analysisResults.ivt.fixations,
    session.analysisResults.idt.fixations,
    session.analysisResults.ivt.saccades,
    {
      duration: session.recordingMetadata.duration,
      sampleCount: session.recordingMetadata.sampleCount,
      screenWidth: session.recordingMetadata.screenWidth,
      screenHeight: session.recordingMetadata.screenHeight,
      oneDegree: session.recordingMetadata.oneDegree,
    }
  );

  let csv = '';

  // Header
  csv += 'Gaze Analysis Metrics Export\n';
  csv += `Exported At,${new Date().toISOString()}\n`;
  csv += `Duration (ms),${metrics.overall.totalDuration}\n`;
  csv += `Sample Count,${metrics.overall.sampleCount}\n`;
  csv += `Sampling Rate (Hz),${metrics.overall.samplingRate.toFixed(2)}\n`;
  csv += `Screen Dimensions,${metrics.overall.screenWidth}x${metrics.overall.screenHeight}\n`;
  csv += `One Degree (px),${metrics.overall.oneDegree}\n`;
  csv += '\n';

  // Fixation metrics comparison
  csv += 'Fixation Metrics Comparison\n';
  csv += 'Metric,I2MC,I-VT,I-DT\n';
  csv += `Count,${metrics.i2mc.fixations.count},${metrics.ivt.fixations.count},${metrics.idt.fixations.count}\n`;
  csv += `Total Duration (ms),${metrics.i2mc.fixations.totalDuration},${metrics.ivt.fixations.totalDuration},${metrics.idt.fixations.totalDuration}\n`;
  csv += `Mean Duration (ms),${metrics.i2mc.fixations.meanDuration.toFixed(2)},${metrics.ivt.fixations.meanDuration.toFixed(2)},${metrics.idt.fixations.meanDuration.toFixed(2)}\n`;
  csv += `Median Duration (ms),${metrics.i2mc.fixations.medianDuration.toFixed(2)},${metrics.ivt.fixations.medianDuration.toFixed(2)},${metrics.idt.fixations.medianDuration.toFixed(2)}\n`;
  csv += `Std Duration (ms),${metrics.i2mc.fixations.stdDuration.toFixed(2)},${metrics.ivt.fixations.stdDuration.toFixed(2)},${metrics.idt.fixations.stdDuration.toFixed(2)}\n`;
  csv += `Min Duration (ms),${metrics.i2mc.fixations.minDuration.toFixed(2)},${metrics.ivt.fixations.minDuration.toFixed(2)},${metrics.idt.fixations.minDuration.toFixed(2)}\n`;
  csv += `Max Duration (ms),${metrics.i2mc.fixations.maxDuration.toFixed(2)},${metrics.ivt.fixations.maxDuration.toFixed(2)},${metrics.idt.fixations.maxDuration.toFixed(2)}\n`;
  csv += `Spatial Spread (px),${metrics.i2mc.fixations.spatialSpread.toFixed(2)},${metrics.ivt.fixations.spatialSpread.toFixed(2)},${metrics.idt.fixations.spatialSpread.toFixed(2)}\n`;
  csv += `Coverage Area (%),${metrics.i2mc.fixations.coverageArea.toFixed(2)},${metrics.ivt.fixations.coverageArea.toFixed(2)},${metrics.idt.fixations.coverageArea.toFixed(2)}\n`;
  csv += '\n';

  // Saccade metrics (I-VT only)
  if (metrics.ivt.saccades) {
    csv += 'Saccade Metrics (I-VT)\n';
    csv += 'Metric,Value\n';
    csv += `Count,${metrics.ivt.saccades.count}\n`;
    csv += `Mean Amplitude (deg),${metrics.ivt.saccades.meanAmplitude.toFixed(2)}\n`;
    csv += `Median Amplitude (deg),${metrics.ivt.saccades.medianAmplitude.toFixed(2)}\n`;
    csv += `Std Amplitude (deg),${metrics.ivt.saccades.stdAmplitude.toFixed(2)}\n`;
    csv += `Min Amplitude (deg),${metrics.ivt.saccades.minAmplitude.toFixed(2)}\n`;
    csv += `Max Amplitude (deg),${metrics.ivt.saccades.maxAmplitude.toFixed(2)}\n`;
    csv += `Mean Duration (ms),${metrics.ivt.saccades.meanDuration.toFixed(2)}\n`;
    csv += `Total Duration (ms),${metrics.ivt.saccades.totalDuration}\n`;
    csv += `Mean Velocity (deg/s),${metrics.ivt.saccades.meanVelocity.toFixed(2)}\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gaze-metrics-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export fixations as CSV (detailed per-fixation data)
 */
export function exportFixationsAsCSV(session: AnalysisSession, algorithm: 'i2mc' | 'ivt' | 'idt'): void {
  let fixations;
  let algorithmName;

  switch (algorithm) {
    case 'i2mc':
      fixations = session.analysisResults.i2mc.fixations;
      algorithmName = 'I2MC';
      break;
    case 'ivt':
      fixations = session.analysisResults.ivt.fixations;
      algorithmName = 'I-VT';
      break;
    case 'idt':
      fixations = session.analysisResults.idt.fixations;
      algorithmName = 'I-DT';
      break;
  }

  let csv = `${algorithmName} Fixations Export\n`;
  csv += `Exported At,${new Date().toISOString()}\n`;
  csv += '\n';
  csv += 'Index,X (px),Y (px),Onset (ms),Offset (ms),Duration (ms)\n';

  fixations.forEach((fixation, index) => {
    csv += `${index + 1},${fixation.x.toFixed(2)},${fixation.y.toFixed(2)},${fixation.onset},${fixation.offset},${fixation.duration}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fixations-${algorithm}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export saccades as CSV (I-VT only)
 */
export function exportSaccadesAsCSV(session: AnalysisSession): void {
  const saccades = session.analysisResults.ivt.saccades;

  if (!saccades || saccades.length === 0) {
    console.warn('No saccades to export');
    return;
  }

  let csv = 'I-VT Saccades Export\n';
  csv += `Exported At,${new Date().toISOString()}\n`;
  csv += '\n';
  csv += 'Index,Onset X (px),Onset Y (px),Offset X (px),Offset Y (px),Onset (ms),Offset (ms),Duration (ms),Amplitude (deg)\n';

  saccades.forEach((saccade, index) => {
    csv += `${index + 1},${saccade.xOnset.toFixed(2)},${saccade.yOnset.toFixed(2)},${saccade.xOffset.toFixed(2)},${saccade.yOffset.toFixed(2)},${saccade.onset},${saccade.offset},${saccade.duration},${saccade.amplitude.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `saccades-ivt-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download the recorded video
 */
export function downloadVideo(videoBlob: Blob): void {
  const url = URL.createObjectURL(videoBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gaze-recording-${Date.now()}.webm`;
  a.click();
  URL.revokeObjectURL(url);
}
