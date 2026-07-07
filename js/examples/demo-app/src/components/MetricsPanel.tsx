/**
 * Metrics Panel Component
 *
 * Displays comprehensive statistics and comparison across all algorithms
 * Includes fixation metrics, saccade metrics, and export functionality
 */

import React, { useMemo } from 'react';
import type { AnalysisSession } from '../types/analysis';
import {
  calculateComparisonMetrics,
  formatMetric,
  formatDuration,
  formatPercentage,
  type ComparisonMetrics,
} from '../utils/metricsCalculator';

interface MetricsPanelProps {
  session: AnalysisSession;
  onExportJSON: () => void;
  onExportCSV: () => void;
}

export default function MetricsPanel({
  session,
  onExportJSON,
  onExportCSV,
}: MetricsPanelProps) {
  const metrics: ComparisonMetrics = useMemo(() => {
    return calculateComparisonMetrics(
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
  }, [session]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-y-auto p-8">
      <div className="max-w-6xl w-full space-y-6">
        {/* Header */}
        <div className="bg-gray-900 text-white p-6 rounded-lg">
          <h2 className="text-2xl font-bold mb-4">Analysis Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400">Duration</p>
              <p className="text-xl font-mono">{formatDuration(metrics.overall.totalDuration)}</p>
            </div>
            <div>
              <p className="text-gray-400">Samples</p>
              <p className="text-xl font-mono">{metrics.overall.sampleCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-400">Sampling Rate</p>
              <p className="text-xl font-mono">{formatMetric(metrics.overall.samplingRate, 1)} Hz</p>
            </div>
            <div>
              <p className="text-gray-400">Screen</p>
              <p className="text-xl font-mono">{metrics.overall.screenWidth} × {metrics.overall.screenHeight}</p>
            </div>
          </div>
        </div>

        {/* Algorithm Comparison Table */}
        <div className="bg-gray-900 text-white p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">Fixation Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400">Metric</th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span>I2MC</span>
                    </div>
                  </th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span>I-VT</span>
                    </div>
                  </th>
                  <th className="text-center py-2 px-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <span>I-DT</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <MetricRow
                  label="Count"
                  values={[
                    metrics.i2mc.fixations.count,
                    metrics.ivt.fixations.count,
                    metrics.idt.fixations.count,
                  ]}
                  formatter={(v) => v.toString()}
                />
                <MetricRow
                  label="Total Duration"
                  values={[
                    metrics.i2mc.fixations.totalDuration,
                    metrics.ivt.fixations.totalDuration,
                    metrics.idt.fixations.totalDuration,
                  ]}
                  formatter={(v) => formatDuration(v)}
                />
                <MetricRow
                  label="Mean Duration"
                  values={[
                    metrics.i2mc.fixations.meanDuration,
                    metrics.ivt.fixations.meanDuration,
                    metrics.idt.fixations.meanDuration,
                  ]}
                  formatter={(v) => formatMetric(v, 0) + 'ms'}
                />
                <MetricRow
                  label="Median Duration"
                  values={[
                    metrics.i2mc.fixations.medianDuration,
                    metrics.ivt.fixations.medianDuration,
                    metrics.idt.fixations.medianDuration,
                  ]}
                  formatter={(v) => formatMetric(v, 0) + 'ms'}
                />
                <MetricRow
                  label="Std Duration"
                  values={[
                    metrics.i2mc.fixations.stdDuration,
                    metrics.ivt.fixations.stdDuration,
                    metrics.idt.fixations.stdDuration,
                  ]}
                  formatter={(v) => formatMetric(v, 0) + 'ms'}
                />
                <MetricRow
                  label="Min Duration"
                  values={[
                    metrics.i2mc.fixations.minDuration,
                    metrics.ivt.fixations.minDuration,
                    metrics.idt.fixations.minDuration,
                  ]}
                  formatter={(v) => formatMetric(v, 0) + 'ms'}
                />
                <MetricRow
                  label="Max Duration"
                  values={[
                    metrics.i2mc.fixations.maxDuration,
                    metrics.ivt.fixations.maxDuration,
                    metrics.idt.fixations.maxDuration,
                  ]}
                  formatter={(v) => formatMetric(v, 0) + 'ms'}
                />
                <MetricRow
                  label="Spatial Spread"
                  values={[
                    metrics.i2mc.fixations.spatialSpread,
                    metrics.ivt.fixations.spatialSpread,
                    metrics.idt.fixations.spatialSpread,
                  ]}
                  formatter={(v) => formatMetric(v, 1) + 'px'}
                />
                <MetricRow
                  label="Coverage Area"
                  values={[
                    metrics.i2mc.fixations.coverageArea,
                    metrics.ivt.fixations.coverageArea,
                    metrics.idt.fixations.coverageArea,
                  ]}
                  formatter={(v) => formatPercentage(v)}
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* Saccade Metrics (I-VT only) */}
        {metrics.ivt.saccades && (
          <div className="bg-gray-900 text-white p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span>Saccade Metrics (I-VT)</span>
              </div>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Count</p>
                <p className="text-xl font-mono">{metrics.ivt.saccades.count}</p>
              </div>
              <div>
                <p className="text-gray-400">Mean Amplitude</p>
                <p className="text-xl font-mono">{formatMetric(metrics.ivt.saccades.meanAmplitude, 2)}°</p>
              </div>
              <div>
                <p className="text-gray-400">Mean Duration</p>
                <p className="text-xl font-mono">{formatMetric(metrics.ivt.saccades.meanDuration, 0)}ms</p>
              </div>
              <div>
                <p className="text-gray-400">Mean Velocity</p>
                <p className="text-xl font-mono">{formatMetric(metrics.ivt.saccades.meanVelocity, 1)}°/s</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-4">
              <div>
                <p className="text-gray-400">Min Amplitude</p>
                <p className="text-lg font-mono">{formatMetric(metrics.ivt.saccades.minAmplitude, 2)}°</p>
              </div>
              <div>
                <p className="text-gray-400">Max Amplitude</p>
                <p className="text-lg font-mono">{formatMetric(metrics.ivt.saccades.maxAmplitude, 2)}°</p>
              </div>
              <div>
                <p className="text-gray-400">Std Amplitude</p>
                <p className="text-lg font-mono">{formatMetric(metrics.ivt.saccades.stdAmplitude, 2)}°</p>
              </div>
              <div>
                <p className="text-gray-400">Total Duration</p>
                <p className="text-lg font-mono">{formatDuration(metrics.ivt.saccades.totalDuration)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Export Actions */}
        <div className="bg-gray-900 text-white p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">Export Data</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={onExportJSON}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Full Data (JSON)
            </button>
            <button
              onClick={onExportCSV}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download Metrics (CSV)
            </button>
          </div>
        </div>

        {/* Algorithm Notes */}
        <div className="bg-gray-900 text-white p-6 rounded-lg text-sm">
          <h3 className="text-lg font-bold mb-3">Algorithm Notes</h3>
          <div className="space-y-3 text-gray-300">
            <div className="flex gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full mt-1 flex-shrink-0"></div>
              <div>
                <p className="font-semibold">I2MC (Two-Step Clustering)</p>
                <p className="text-xs text-gray-400">Most robust to noise, uses k-means clustering with k=2 and multi-scale window analysis (200ms). Best for noisy data.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-3 h-3 bg-blue-500 rounded-full mt-1 flex-shrink-0"></div>
              <div>
                <p className="font-semibold">I-VT (Velocity Threshold)</p>
                <p className="text-xs text-gray-400">Velocity-based detection with 30°/s threshold. Fast and includes saccade detection. Good for general use.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mt-1 flex-shrink-0"></div>
              <div>
                <p className="font-semibold">I-DT (Dispersion Threshold)</p>
                <p className="text-xs text-gray-400">Dispersion-based detection with 1.0° threshold. Simple and efficient. Best for high-quality data.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Metric Row Component for Comparison Table
 */
interface MetricRowProps {
  label: string;
  values: number[];
  formatter: (value: number) => string;
}

function MetricRow({ label, values, formatter }: MetricRowProps) {
  // Find the best value (highlight it)
  const maxValue = Math.max(...values);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const minValue = Math.min(...values);

  const isHighlighted = (value: number, index: number) => {
    // For count and coverage, higher is better
    if (label.includes('Count') || label.includes('Coverage')) {
      return value === maxValue;
    }
    // For other metrics, show all equally
    return false;
  };

  return (
    <tr className="border-b border-gray-800">
      <td className="py-2 px-3 text-gray-300">{label}</td>
      {values.map((value, index) => (
        <td
          key={index}
          className={`py-2 px-3 text-center font-mono ${
            isHighlighted(value, index) ? 'text-green-400 font-semibold' : 'text-white'
          }`}
        >
          {formatter(value)}
        </td>
      ))}
    </tr>
  );
}
