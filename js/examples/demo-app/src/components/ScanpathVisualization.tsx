/**
 * Scanpath Visualization Component
 *
 * Displays sequential fixation path with numbered markers
 * Supports algorithm selection, fixation limit, and export functionality
 */

import React, { useMemo, useState } from 'react';
import type { AnalysisResults } from '../types/analysis';
import { generateScanpathSVG, downloadScanpath, exportScanpathAsPNG } from '../utils/scanpathGenerator';

interface ScanpathVisualizationProps {
  analysisResults: AnalysisResults;
  width: number;
  height: number;
  selectedAlgorithm: 'i2mc' | 'ivt' | 'idt';
  onAlgorithmChange: (algorithm: 'i2mc' | 'ivt' | 'idt') => void;
}

export default function ScanpathVisualization({
  analysisResults,
  width,
  height,
  selectedAlgorithm,
  onAlgorithmChange,
}: ScanpathVisualizationProps) {
  const [maxFixations, setMaxFixations] = useState<number | undefined>(undefined);

  // Get fixations based on selected algorithm
  const fixations = useMemo(() => {
    switch (selectedAlgorithm) {
      case 'i2mc':
        return analysisResults.i2mc.fixations;
      case 'ivt':
        return analysisResults.ivt.fixations;
      case 'idt':
        return analysisResults.idt.fixations;
    }
  }, [selectedAlgorithm, analysisResults]);

  // Generate scanpath SVG
  const scanpathSVG = useMemo(() => {
    return generateScanpathSVG(fixations, width, height, maxFixations);
  }, [fixations, width, height, maxFixations]);

  const handleExportSVG = () => {
    const filename = `scanpath-${selectedAlgorithm}-${Date.now()}.svg`;
    downloadScanpath(scanpathSVG, filename);
  };

  const handleExportPNG = async () => {
    try {
      const blob = await exportScanpathAsPNG(scanpathSVG, width, height);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scanpath-${selectedAlgorithm}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export scanpath as PNG:', error);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* SVG Display */}
      <div
        className="max-w-full max-h-full"
        dangerouslySetInnerHTML={{ __html: scanpathSVG }}
      />

      {/* Control Panel */}
      <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-90 text-white p-4 rounded-lg shadow-lg space-y-4">
        <h3 className="text-sm font-semibold uppercase text-gray-400">Scanpath Controls</h3>

        {/* Algorithm Selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={selectedAlgorithm === 'i2mc'}
              onChange={() => onAlgorithmChange('i2mc')}
              className="w-4 h-4"
            />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm">I2MC</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={selectedAlgorithm === 'ivt'}
              onChange={() => onAlgorithmChange('ivt')}
              className="w-4 h-4"
            />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm">I-VT</span>
            </div>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={selectedAlgorithm === 'idt'}
              onChange={() => onAlgorithmChange('idt')}
              className="w-4 h-4"
            />
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-sm">I-DT</span>
            </div>
          </label>
        </div>

        {/* Fixation Limit */}
        <div className="pt-2 border-t border-gray-700">
          <label className="text-xs text-gray-400 block mb-2">
            Show First N Fixations
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max={fixations.length}
              value={maxFixations ?? fixations.length}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                setMaxFixations(isNaN(value) ? undefined : value);
              }}
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm"
            />
            <button
              onClick={() => setMaxFixations(undefined)}
              className="px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs transition"
            >
              All
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
          <div className="flex justify-between">
            <span>Showing:</span>
            <span className="font-mono">
              {maxFixations ?? fixations.length} / {fixations.length}
            </span>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleExportSVG}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition text-sm font-semibold"
          >
            Download SVG
          </button>
          <button
            onClick={handleExportPNG}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 rounded transition text-sm font-semibold"
          >
            Download PNG
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-90 text-white p-4 rounded-lg shadow-lg">
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Legend</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border-4 border-blue-500 bg-blue-500 bg-opacity-10 flex items-center justify-center text-white font-bold">
              1
            </div>
            <span>Numbered fixations (circle size = duration)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-2 bg-blue-500 relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2" style={{
                width: 0,
                height: 0,
                borderLeft: '8px solid rgb(59, 130, 246)',
                borderTop: '4px solid transparent',
                borderBottom: '4px solid transparent',
              }}></div>
            </div>
            <span>Saccade direction (later = more opaque)</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Shows temporal sequence of visual attention
        </p>
      </div>
    </div>
  );
}
