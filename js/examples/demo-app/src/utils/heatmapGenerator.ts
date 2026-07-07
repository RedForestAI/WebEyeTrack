/**
 * Heatmap Generation Utility
 *
 * Generates density-based heatmaps from fixation data
 * Uses Gaussian kernel for smooth, visually appealing heatmaps
 */

import type { Fixation } from 'kollar-ts';

/**
 * Generate heatmap from fixations using Gaussian density
 *
 * @param fixations - Array of fixations to visualize
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param radius - Gaussian kernel radius (default: 50px)
 * @returns Canvas with heatmap rendered
 */
export function generateHeatmap(
  fixations: Fixation[],
  width: number,
  height: number,
  radius: number = 50
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (fixations.length === 0) {
    return canvas;
  }

  // Create density map
  const densityMap = new Float32Array(width * height);
  const sigma = radius / 3; // Standard deviation for Gaussian

  // Add each fixation to density map
  for (const fixation of fixations) {
    // Weight by fixation duration (longer fixations = more important)
    const weight = Math.sqrt(fixation.duration / 100); // Scale by sqrt to avoid extreme values

    // Apply Gaussian kernel
    const x0 = Math.round(fixation.x);
    const y0 = Math.round(fixation.y);

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;

        if (x >= 0 && x < width && y >= 0 && y < height) {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance <= radius) {
            // Gaussian kernel: exp(-(distance^2) / (2 * sigma^2))
            const value = Math.exp(-(distance * distance) / (2 * sigma * sigma));
            densityMap[y * width + x] += value * weight;
          }
        }
      }
    }
  }

  // Find max value for normalization
  let maxDensity = 0;
  for (let i = 0; i < densityMap.length; i++) {
    if (densityMap[i] > maxDensity) {
      maxDensity = densityMap[i];
    }
  }

  // Create image data with jet colormap
  const imageData = ctx.createImageData(width, height);

  for (let i = 0; i < densityMap.length; i++) {
    const normalizedValue = maxDensity > 0 ? densityMap[i] / maxDensity : 0;
    const color = jetColormap(normalizedValue);

    const pixelIndex = i * 4;
    imageData.data[pixelIndex] = color.r;
    imageData.data[pixelIndex + 1] = color.g;
    imageData.data[pixelIndex + 2] = color.b;
    imageData.data[pixelIndex + 3] = normalizedValue > 0.05 ? 200 : 0; // Alpha (threshold to avoid noise)
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * Jet colormap (blue → cyan → green → yellow → red)
 * Classic heatmap colormap from MATLAB
 */
function jetColormap(value: number): { r: number; g: number; b: number } {
  const v = Math.max(0, Math.min(1, value));

  let r, g, b;

  if (v < 0.125) {
    r = 0;
    g = 0;
    b = 128 + Math.floor(127 * (v / 0.125));
  } else if (v < 0.375) {
    r = 0;
    g = Math.floor(255 * ((v - 0.125) / 0.25));
    b = 255;
  } else if (v < 0.625) {
    r = Math.floor(255 * ((v - 0.375) / 0.25));
    g = 255;
    b = 255 - Math.floor(255 * ((v - 0.375) / 0.25));
  } else if (v < 0.875) {
    r = 255;
    g = 255 - Math.floor(255 * ((v - 0.625) / 0.25));
    b = 0;
  } else {
    r = 255 - Math.floor(128 * ((v - 0.875) / 0.125));
    g = 0;
    b = 0;
  }

  return { r, g, b };
}

/**
 * Export heatmap canvas as PNG blob
 */
export async function exportHeatmapAsPNG(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/png');
  });
}

/**
 * Download heatmap as PNG file
 */
export async function downloadHeatmap(canvas: HTMLCanvasElement, filename: string = 'heatmap.png') {
  const blob = await exportHeatmapAsPNG(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
