/**
 * Screen calibration utilities
 *
 * Calculates visual angle parameters for gaze analysis algorithms
 * Provides screen size presets and auto-detection
 */

export interface ScreenPreset {
  id: string;
  label: string;
  diagonalInches: number;
  widthCm: number;
  heightCm: number;
  typicalDistanceCm: number;
}

/**
 * Common monitor size presets
 * Dimensions based on 16:9 aspect ratio
 */
export const SCREEN_PRESETS: Record<string, ScreenPreset> = {
  laptop13: {
    id: 'laptop13',
    label: '13.3" Laptop',
    diagonalInches: 13.3,
    widthCm: 29.4,
    heightCm: 16.5,
    typicalDistanceCm: 50,
  },
  laptop15: {
    id: 'laptop15',
    label: '15.6" Laptop',
    diagonalInches: 15.6,
    widthCm: 34.5,
    heightCm: 19.4,
    typicalDistanceCm: 55,
  },
  desktop21: {
    id: 'desktop21',
    label: '21.5" Monitor',
    diagonalInches: 21.5,
    widthCm: 47.6,
    heightCm: 26.8,
    typicalDistanceCm: 60,
  },
  desktop24: {
    id: 'desktop24',
    label: '24" Monitor',
    diagonalInches: 24,
    widthCm: 53.1,
    heightCm: 29.9,
    typicalDistanceCm: 60,
  },
  desktop27: {
    id: 'desktop27',
    label: '27" Monitor',
    diagonalInches: 27,
    widthCm: 59.7,
    heightCm: 33.6,
    typicalDistanceCm: 65,
  },
  desktop32: {
    id: 'desktop32',
    label: '32" Monitor',
    diagonalInches: 32,
    widthCm: 70.8,
    heightCm: 39.9,
    typicalDistanceCm: 70,
  },
};

/**
 * Auto-detect likely screen type based on pixel dimensions
 * Uses heuristics to estimate physical screen size
 *
 * @param screenWidthPx - Screen width in pixels
 * @param screenHeightPx - Screen height in pixels
 * @returns Best guess preset ID and confidence (0-1)
 */
export function detectScreenType(
  screenWidthPx: number,
  screenHeightPx: number
): { presetId: string; confidence: number } {
  // Calculate diagonal in pixels
  const diagonalPx = Math.sqrt(screenWidthPx ** 2 + screenHeightPx ** 2);

  // Estimate DPI (rough approximation)
  // Most displays are between 90-220 DPI
  // Common values: 96 (standard), 110 (laptop), 163 (Retina), 220 (4K)
  const estimatedDPI = window.devicePixelRatio >= 2 ? 163 : 96;

  // Estimate diagonal in inches
  const estimatedDiagonal = diagonalPx / estimatedDPI;

  // Find closest preset
  let closestPreset = 'desktop24';
  let minDiff = Infinity;

  for (const [id, preset] of Object.entries(SCREEN_PRESETS)) {
    const diff = Math.abs(preset.diagonalInches - estimatedDiagonal);
    if (diff < minDiff) {
      minDiff = diff;
      closestPreset = id;
    }
  }

  // Calculate confidence based on how close the match is
  // Within 2 inches = high confidence
  // Within 5 inches = medium confidence
  // Beyond 5 inches = low confidence
  let confidence = 0.9;
  if (minDiff > 2) {
    confidence = Math.max(0.3, 0.9 - (minDiff - 2) * 0.15);
  }

  return { presetId: closestPreset, confidence };
}

/**
 * Calculate the number of pixels per degree of visual angle
 *
 * This is a critical parameter for fixation detection algorithms.
 * It converts between screen space (pixels) and visual angle (degrees).
 *
 * Formula: oneDegree = (screenWidthPx / screenWidthCm) * (2 * distanceCm * tan(0.5°))
 *
 * @param screenWidthCm - Physical screen width in centimeters
 * @param distanceCm - Viewing distance in centimeters
 * @param screenWidthPx - Screen width in pixels
 * @returns Pixels per degree of visual angle
 *
 * @example
 * // 24" monitor (53.1cm wide) at 60cm distance with 1920px width
 * const oneDegree = calculateOneDegree(53.1, 60, 1920);
 * // Returns ~37 pixels/degree
 */
export function calculateOneDegree(
  screenWidthCm: number,
  distanceCm: number,
  screenWidthPx: number
): number {
  // Pixels per centimeter
  const pixelsPerCm = screenWidthPx / screenWidthCm;

  // One degree of visual angle in centimeters at given distance
  // tan(0.5°) ≈ 0.00872665 radians
  const oneDegreeInCm = 2 * distanceCm * Math.tan((Math.PI / 180) * 0.5);

  // Convert to pixels
  const oneDegree = oneDegreeInCm * pixelsPerCm;

  return oneDegree;
}

/**
 * Validate oneDegree parameter
 * Typical range: 20-60 pixels/degree
 *
 * @param oneDegree - Pixels per degree
 * @returns Validation result with warning if needed
 */
export function validateOneDegree(oneDegree: number): {
  valid: boolean;
  warning?: string;
} {
  if (oneDegree < 15) {
    return {
      valid: false,
      warning: 'OneDegree value is too low. Check screen size or distance.',
    };
  }

  if (oneDegree > 80) {
    return {
      valid: false,
      warning: 'OneDegree value is too high. Check screen size or distance.',
    };
  }

  if (oneDegree < 20 || oneDegree > 60) {
    return {
      valid: true,
      warning: 'OneDegree value is outside typical range (20-60). Verify settings.',
    };
  }

  return { valid: true };
}

/**
 * Load saved screen preset from localStorage
 */
export function loadSavedPreset(): string | null {
  try {
    return localStorage.getItem('webeyetrack-screen-preset');
  } catch {
    return null;
  }
}

/**
 * Save screen preset to localStorage
 */
export function savePreset(presetId: string): void {
  try {
    localStorage.setItem('webeyetrack-screen-preset', presetId);
  } catch (error) {
    console.warn('Failed to save screen preset:', error);
  }
}
