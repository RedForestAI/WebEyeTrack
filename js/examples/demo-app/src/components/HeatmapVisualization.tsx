/**
 * Heatmap Visualization Component
 *
 * Displays density-based heatmap of fixations
 * Supports algorithm selection and export functionality
 */

import React, { useMemo, useRef, useEffect } from 'react';
import type { AnalysisResults } from '../types/analysis';
import { generateHeatmap, downloadHeatmap } from '../utils/heatmapGenerator';
import type { Fixation } from 'kollar-ts';

interface HeatmapVisualizationProps {
  analysisResults: AnalysisResults;
  width: number;
  height: number;
  selectedAlgorithm: 'i2mc' | 'ivt' | 'idt' | 'all';
  onAlgorithmChange: (algorithm: 'i2mc' | 'ivt' | 'idt' | 'all') => void;
}

export default function HeatmapVisualization({
  analysisResults,
  width,
  height,
  selectedAlgorithm,
  onAlgorithmChange,
}: HeatmapVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Get fixations based on selected algorithm
  const fixations = useMemo((): Fixation[] => {
    switch (selectedAlgorithm) {
      case 'i2mc':
        return analysisResults.i2mc.fixations;
      case 'ivt':
        return analysisResults.ivt.fixations;
      case 'idt':
        return analysisResults.idt.fixations;
      case 'all':
        return [
          ...analysisResults.i2mc.fixations,
          ...analysisResults.ivt.fixations,
          ...analysisResults.idt.fixations,
        ];
    }
  }, [selectedAlgorithm, analysisResults]);

  // Generate heatmap when fixations or dimensions change
  const heatmapCanvas = useMemo(() => {
    return generateHeatmap(fixations, width, height, 50);
  }, [fixations, width, height]);

  // Draw heatmap to canvas
  useEffect(() => {
    if (canvasRef.current && heatmapCanvas) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(heatmapCanvas, 0, 0);
      }
    }
  }, [heatmapCanvas, width, height]);

  const handleExport = () => {
    if (heatmapCanvas) {
      const filename = `heatmap-${selectedAlgorithm}-${Date.now()}.png`;
      downloadHeatmap(heatmapCanvas, filename);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black">
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="max-w-full max-h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Control Panel */}
      <div className="absolute top-4 right-4 bg-gray-900 bg-opacity-90 text-white p-4 rounded-lg shadow-lg space-y-4">
        <h3 className="text-sm font-semibold uppercase text-gray-400">Heatmap Controls</h3>

        {/* Algorithm Selection */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={selectedAlgorithm === 'all'}
              onChange={() => onAlgorithmChange('all')}
              className="w-4 h-4"
            />
            <span className="text-sm">All Algorithms</span>
          </label>

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

        {/* Statistics */}
        <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
          <div className="flex justify-between">
            <span>Fixations:</span>
            <span className="font-mono">{fixations.length}</span>
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded transition text-sm font-semibold"
        >
          Download PNG
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-90 text-white p-4 rounded-lg shadow-lg">
        <h3 className="text-xs font-semibold uppercase text-gray-400 mb-2">Density</h3>
        <div className="flex items-center gap-2">
          <div className="w-24 h-4 rounded" style={{
            background: 'linear-gradient(to right, rgb(0,0,128), rgb(0,255,255), rgb(0,255,0), rgb(255,255,0), rgb(255,0,0))'
          }}></div>
          <div className="flex justify-between w-full text-xs text-gray-400">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Warmer colors indicate more visual attention
        </p>
      </div>
    </div>
  );
}
