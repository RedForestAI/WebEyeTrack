/**
 * Scanpath Generation Utility
 *
 * Generates scanpath visualizations showing the sequence of fixations
 * Connected by lines with numbered markers
 */

import type { Fixation } from 'kollar-ts';

/**
 * Generate scanpath SVG from fixations
 *
 * @param fixations - Array of fixations in temporal order
 * @param width - SVG width in pixels
 * @param height - SVG height in pixels
 * @param maxFixations - Maximum number of fixations to show (optional)
 * @returns SVG string
 */
export function generateScanpathSVG(
  fixations: Fixation[],
  width: number,
  height: number,
  maxFixations?: number
): string {
  const fixationsToShow = maxFixations
    ? fixations.slice(0, maxFixations)
    : fixations;

  if (fixationsToShow.length === 0) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  // Add arrow marker definition
  svg += `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="rgba(59, 130, 246, 0.6)" />
      </marker>
    </defs>
  `;

  // Draw connecting lines with arrows
  for (let i = 1; i < fixationsToShow.length; i++) {
    const prev = fixationsToShow[i - 1];
    const curr = fixationsToShow[i];

    // Calculate line opacity based on sequence (fade earlier fixations)
    const opacity = 0.3 + (i / fixationsToShow.length) * 0.5;

    svg += `
      <line
        x1="${prev.x}"
        y1="${prev.y}"
        x2="${curr.x}"
        y2="${curr.y}"
        stroke="rgba(59, 130, 246, ${opacity})"
        stroke-width="2"
        marker-end="url(#arrowhead)"
      />
    `;
  }

  // Draw fixation circles with numbers
  fixationsToShow.forEach((fixation, index) => {
    // Calculate circle size based on duration
    const minRadius = 15;
    const maxRadius = 40;
    const minDuration = 100;
    const maxDuration = 1000;

    const radius = minRadius + ((fixation.duration - minDuration) / (maxDuration - minDuration)) * (maxRadius - minRadius);
    const clampedRadius = Math.max(minRadius, Math.min(maxRadius, radius));

    // Calculate opacity (later fixations are more opaque)
    const opacity = 0.5 + (index / fixationsToShow.length) * 0.5;

    // Circle with gradient
    svg += `
      <circle
        cx="${fixation.x}"
        cy="${fixation.y}"
        r="${clampedRadius}"
        fill="rgba(59, 130, 246, ${opacity * 0.3})"
        stroke="rgba(59, 130, 246, ${opacity})"
        stroke-width="3"
      />
    `;

    // Number text
    svg += `
      <text
        x="${fixation.x}"
        y="${fixation.y}"
        text-anchor="middle"
        dominant-baseline="central"
        fill="white"
        font-size="16"
        font-weight="bold"
        font-family="Arial, sans-serif"
      >
        ${index + 1}
      </text>
    `;

    // Duration label (small text below circle)
    svg += `
      <text
        x="${fixation.x}"
        y="${fixation.y + clampedRadius + 15}"
        text-anchor="middle"
        fill="rgba(255, 255, 255, 0.8)"
        font-size="12"
        font-family="Arial, sans-serif"
      >
        ${fixation.duration.toFixed(0)}ms
      </text>
    `;
  });

  svg += '</svg>';
  return svg;
}

/**
 * Export scanpath as SVG blob
 */
export function exportScanpathAsSVG(svgString: string): Blob {
  return new Blob([svgString], { type: 'image/svg+xml' });
}

/**
 * Download scanpath as SVG file
 */
export function downloadScanpath(svgString: string, filename: string = 'scanpath.svg') {
  const blob = exportScanpathAsSVG(svgString);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Convert SVG to PNG using canvas
 */
export async function exportScanpathAsPNG(
  svgString: string,
  width: number,
  height: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };

    img.src = url;
  });
}
