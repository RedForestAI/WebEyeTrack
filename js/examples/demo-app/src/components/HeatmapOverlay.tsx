/**
 * Live Heatmap Overlay Component
 *
 * Efficient real-time heat map visualization using:
 * - O(1) grid-based updates (50x50px cells)
 * - requestAnimationFrame rendering loop
 * - Refs to prevent React re-renders
 * - Decay animation for visual fade effect
 * - Sparse data structure (only stores active cells)
 *
 * Based on the efficient implementation from proctoring-sdk dashboard.
 */

import React, { useRef, useEffect } from 'react';
import { useGazeStore } from '../stores/gazeStore';

const GRID_SIZE = 50; // 50x50 pixel cells for O(1) lookups
const DECAY_RATE = 0.995; // Gradual fade per frame
const MIN_HEAT_THRESHOLD = 0.01; // Zero out very small values

export default function HeatmapOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const heatmapDataRef = useRef<number[][]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Subscribe to specific store slices (optimized re-rendering)
  const heatmapData = useGazeStore((state) => state.heatmapData);
  const showHeatmap = useGazeStore((state) => state.showHeatmap);

  /**
   * Get heat color from normalized value (0-1)
   * 11-color gradient: Black → Dark Blue → Blue → Cyan → Green →
   * Yellow → Orange → Red → Dark Red → Purple → White
   */
  const getHeatColor = (t: number): string => {
    t = Math.max(0, Math.min(1, t));
    const alpha = 0.5;

    let r: number, g: number, b: number;

    if (t < 0.125) {
      // Black → Dark Blue
      const localT = t / 0.125;
      r = 0;
      g = 0;
      b = Math.floor(128 + localT * 127);
    } else if (t < 0.25) {
      // Dark Blue → Blue
      r = 0;
      g = 0;
      b = 255;
    } else if (t < 0.375) {
      // Blue → Cyan
      const localT = (t - 0.25) / 0.125;
      r = 0;
      g = Math.floor(localT * 255);
      b = 255;
    } else if (t < 0.5) {
      // Cyan → Green
      const localT = (t - 0.375) / 0.125;
      r = 0;
      g = 255;
      b = Math.floor((1 - localT) * 255);
    } else if (t < 0.625) {
      // Green → Yellow
      const localT = (t - 0.5) / 0.125;
      r = Math.floor(localT * 255);
      g = 255;
      b = 0;
    } else if (t < 0.75) {
      // Yellow → Orange
      const localT = (t - 0.625) / 0.125;
      r = 255;
      g = Math.floor(255 - localT * 128);
      b = 0;
    } else if (t < 0.875) {
      // Orange → Red
      const localT = (t - 0.75) / 0.125;
      r = 255;
      g = Math.floor(127 - localT * 127);
      b = 0;
    } else {
      // Red → White
      const localT = (t - 0.875) / 0.125;
      r = 255;
      g = Math.floor(localT * 255);
      b = Math.floor(localT * 255);
    }

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  /**
   * Main rendering loop using requestAnimationFrame
   */
  const renderHeatmap = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const data = heatmapDataRef.current;

    if (!canvas || !ctx || !data.length) {
      return;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Find max heat for normalization
    let maxHeat = 0;
    for (let y = 0; y < data.length; y++) {
      for (let x = 0; x < data[0].length; x++) {
        maxHeat = Math.max(maxHeat, data[y][x]);
      }
    }

    // Draw heatmap cells (only render non-zero cells)
    if (maxHeat > 0) {
      for (let y = 0; y < data.length; y++) {
        for (let x = 0; x < data[0].length; x++) {
          const heat = data[y][x];
          if (heat > 0) {
            const normalized = heat / maxHeat;
            const color = getHeatColor(normalized);
            ctx.fillStyle = color;
            ctx.fillRect(x * GRID_SIZE, y * GRID_SIZE, GRID_SIZE, GRID_SIZE);
          }
        }
      }
    }

    // Apply decay (gradual fade effect)
    for (let y = 0; y < data.length; y++) {
      for (let x = 0; x < data[0].length; x++) {
        data[y][x] *= DECAY_RATE;
        if (data[y][x] < MIN_HEAT_THRESHOLD) {
          data[y][x] = 0;
        }
      }
    }

    // Continue animation loop
    animationFrameRef.current = requestAnimationFrame(renderHeatmap);
  };

  /**
   * Update heatmap data from store (sparse updates)
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const data = heatmapDataRef.current;
    const gridWidth = Math.ceil(canvas.width / GRID_SIZE);
    const gridHeight = Math.ceil(canvas.height / GRID_SIZE);

    // Process new heat data from store
    if (heatmapData.length > 0) {
      heatmapData.forEach((cell) => {
        if (
          cell.col >= 0 && cell.col < gridWidth &&
          cell.row >= 0 && cell.row < gridHeight
        ) {
          // Ensure grid row is initialized
          if (!data[cell.row]) {
            data[cell.row] = new Array(gridWidth).fill(0);
          }
          // Accumulate weight (ADD to existing, don't replace)
          // This allows heat to build up over time despite decay
          data[cell.row][cell.col] = (data[cell.row][cell.col] || 0) + cell.weight;
        }
      });
    }
  }, [heatmapData]);

  /**
   * Initialize canvas and context
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size to window size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Get context with optimization hint
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      console.error('Failed to get canvas 2D context');
      return;
    }

    ctxRef.current = ctx;

    // Initialize heatmap grid
    const gridWidth = Math.ceil(canvas.width / GRID_SIZE);
    const gridHeight = Math.ceil(canvas.height / GRID_SIZE);
    heatmapDataRef.current = Array.from({ length: gridHeight }, () =>
      new Array(gridWidth).fill(0)
    );

    console.log(`[HeatmapOverlay] Initialized: ${gridWidth}x${gridHeight} grid (${GRID_SIZE}px cells)`);

    // Handle window resize
    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const newGridWidth = Math.ceil(canvas.width / GRID_SIZE);
        const newGridHeight = Math.ceil(canvas.height / GRID_SIZE);
        heatmapDataRef.current = Array.from({ length: newGridHeight }, () =>
          new Array(newGridWidth).fill(0)
        );

        console.log(`[HeatmapOverlay] Resized: ${newGridWidth}x${newGridHeight} grid`);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  /**
   * Start/stop animation loop based on heatmap visibility
   * Animation runs whenever heatmap is enabled, regardless of recording state
   * Eye tracking is already active and feeding data to the heatmap grid
   */
  useEffect(() => {
    if (showHeatmap) {
      console.log('[HeatmapOverlay] Starting animation loop');
      animationFrameRef.current = requestAnimationFrame(renderHeatmap);
    } else {
      console.log('[HeatmapOverlay] Stopping animation loop');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHeatmap]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-screen h-screen pointer-events-none z-40"
      style={{
        display: showHeatmap ? 'block' : 'none',
        background: 'transparent',
      }}
    />
  );
}
