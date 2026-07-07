import { ImageData as CanvasImageData } from 'canvas';

// Shim canvas ImageData to match DOM ImageData interface for testing
// Cannot extend in ES5, so we wrap the constructor
const OriginalImageData = CanvasImageData;
global.ImageData = function(dataOrWidth: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
  let instance: CanvasImageData;
  if (typeof dataOrWidth === 'number') {
    instance = new OriginalImageData(dataOrWidth, widthOrHeight as number);
  } else {
    instance = new OriginalImageData(dataOrWidth, widthOrHeight as number, height);
  }
  // Add missing colorSpace property from DOM ImageData
  Object.defineProperty(instance, 'colorSpace', {
    value: 'srgb',
    writable: false,
    enumerable: true
  });
  return instance;
} as any;

import {
  computeHomography,
  applyHomography,
  warpImageData,
  resizeImageData,
  compareImageData
} from './mathUtils';
import { Point } from "../types";

function pointsAlmostEqual(p1: Point, p2: Point, epsilon: number = 1e-3) {
  return (
    Math.abs(p1[0] - p2[0]) < epsilon &&
    Math.abs(p1[1] - p2[1]) < epsilon
  );
}

test('computeHomography should map source to destination', () => {
  const src: Point[] = [
    [100, 100],
    [100, 400],
    [400, 400],
    [400, 100],
  ];

  const dst: Point[] = [
    [0, 0],
    [0, 300],
    [300, 300],
    [300, 0],
  ];

  const H = computeHomography(src, dst);

  for (let i = 0; i < src.length; i++) {
    const mapped = applyHomography(H, src[i]);
    // console.log(src[i], mapped, dst[i]);
    expect(pointsAlmostEqual(mapped, dst[i])).toBe(true);
  }
});

function createMockImageData(width: number, height: number, color = [255, 0, 0, 255]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set(color, i);
  }
  return new ImageData(data, width, height);
}

test('warpImageData produces ImageData with desired output size', () => {
  const srcWidth = 100;
  const srcHeight = 100;
  const outputWidth = 200;
  const outputHeight = 100;

  const srcImage = createMockImageData(srcWidth, srcHeight);

  const srcPoints = [
    [0, 0],
    [0, srcHeight],
    [srcWidth, srcHeight],
    [srcWidth, 0],
  ];

  const dstPoints = [
    [0, 0],
    [0, outputHeight],
    [outputWidth, outputHeight],
    [outputWidth, 0],
  ];

  const H = computeHomography(srcPoints, dstPoints);
  const warped = warpImageData(srcImage, H, outputWidth, outputHeight);
  // Verify ImageData properties instead of instanceof (shim doesn't support instanceof)
  expect(warped).toHaveProperty('width');
  expect(warped).toHaveProperty('height');
  expect(warped).toHaveProperty('data');
  expect(warped.width).toBe(outputWidth);
  expect(warped.height).toBe(outputHeight);
});

// ============================================================================
// Tests for resizeImageData
// ============================================================================

describe('resizeImageData', () => {
  test('should resize to correct dimensions', () => {
    const srcImage = createMockImageData(100, 100);
    const resized = resizeImageData(srcImage, 200, 150);

    expect(resized.width).toBe(200);
    expect(resized.height).toBe(150);
    expect(resized.data.length).toBe(200 * 150 * 4);
  });

  test('should handle upscaling', () => {
    const srcImage = createMockImageData(50, 50, [128, 64, 32, 255]);
    const resized = resizeImageData(srcImage, 100, 100);

    expect(resized.width).toBe(100);
    expect(resized.height).toBe(100);

    // Sample a few pixels to verify color is preserved (within interpolation tolerance)
    const centerIdx = (50 * 100 + 50) * 4;
    expect(Math.abs(resized.data[centerIdx] - 128)).toBeLessThan(5);
    expect(Math.abs(resized.data[centerIdx + 1] - 64)).toBeLessThan(5);
    expect(Math.abs(resized.data[centerIdx + 2] - 32)).toBeLessThan(5);
  });

  test('should handle downscaling', () => {
    const srcImage = createMockImageData(200, 200, [255, 128, 64, 255]);
    const resized = resizeImageData(srcImage, 100, 100);

    expect(resized.width).toBe(100);
    expect(resized.height).toBe(100);

    // Verify color is preserved
    const centerIdx = (50 * 100 + 50) * 4;
    expect(Math.abs(resized.data[centerIdx] - 255)).toBeLessThan(5);
    expect(Math.abs(resized.data[centerIdx + 1] - 128)).toBeLessThan(5);
  });

  test('should handle non-uniform scaling', () => {
    const srcImage = createMockImageData(100, 50);
    const resized = resizeImageData(srcImage, 200, 150);

    expect(resized.width).toBe(200);
    expect(resized.height).toBe(150);
  });

  test('should use bilinear interpolation for smooth results', () => {
    // Create a gradient image: black on left, white on right
    const width = 100;
    const height = 50;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const value = Math.floor((x / width) * 255);
        data[idx] = value;     // R
        data[idx + 1] = value; // G
        data[idx + 2] = value; // B
        data[idx + 3] = 255;   // A
      }
    }

    const srcImage = new ImageData(data, width, height);
    const resized = resizeImageData(srcImage, 50, 25);

    // Check that interpolation created smooth gradient
    // Pixel at 25% should be approximately 25% gray
    const quarterIdx = (12 * 50 + 12) * 4;
    const quarterValue = resized.data[quarterIdx];
    expect(quarterValue).toBeGreaterThan(40);  // Should be > 16% (nearest neighbor would give 0)
    expect(quarterValue).toBeLessThan(100);    // Should be < 40%
  });
});

// ============================================================================
// Tests for compareImageData
// ============================================================================

describe('compareImageData', () => {
  test('should return zero difference for identical images', () => {
    const img1 = createMockImageData(100, 100, [128, 64, 32, 255]);
    const img2 = createMockImageData(100, 100, [128, 64, 32, 255]);

    const result = compareImageData(img1, img2);

    expect(result.maxDiff).toBe(0);
    expect(result.meanDiff).toBe(0);
    expect(result.histogram[0]).toBe(100 * 100 * 3); // All pixels have 0 difference
  });

  test('should detect differences between images', () => {
    const img1 = createMockImageData(100, 100, [100, 100, 100, 255]);
    const img2 = createMockImageData(100, 100, [110, 90, 105, 255]);

    const result = compareImageData(img1, img2);

    expect(result.maxDiff).toBeGreaterThan(0);
    expect(result.meanDiff).toBeGreaterThan(0);
  });

  test('should throw error for mismatched dimensions', () => {
    const img1 = createMockImageData(100, 100);
    const img2 = createMockImageData(200, 200);

    expect(() => compareImageData(img1, img2)).toThrow('same dimensions');
  });

  test('should ignore alpha channel in comparison', () => {
    const img1 = createMockImageData(50, 50, [128, 128, 128, 255]);
    const img2 = createMockImageData(50, 50, [128, 128, 128, 0]);

    const result = compareImageData(img1, img2);

    // RGB channels are identical, alpha difference should be ignored
    expect(result.maxDiff).toBe(0);
    expect(result.meanDiff).toBe(0);
  });
});

// ============================================================================
// Tests comparing resizeImageData vs homography for rectangular scaling
// ============================================================================

describe('resizeImageData vs homography optimization', () => {
  test('should produce similar results to homography for rectangular scaling', () => {
    // Create a test image with some pattern
    const srcWidth = 80;
    const srcHeight = 60;
    const dstWidth = 512;
    const dstHeight = 128;

    // Create a patterned image (checkerboard)
    const data = new Uint8ClampedArray(srcWidth * srcHeight * 4);
    for (let y = 0; y < srcHeight; y++) {
      for (let x = 0; x < srcWidth; x++) {
        const idx = (y * srcWidth + x) * 4;
        const isWhite = (Math.floor(x / 10) + Math.floor(y / 10)) % 2 === 0;
        const value = isWhite ? 255 : 64;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
    const srcImage = new ImageData(data, srcWidth, srcHeight);

    // Method 1: Using resizeImageData (optimized)
    const resized = resizeImageData(srcImage, dstWidth, dstHeight);

    // Method 2: Using homography (old approach)
    const srcPoints: Point[] = [
      [0, 0],
      [0, srcHeight],
      [srcWidth, srcHeight],
      [srcWidth, 0],
    ];
    const dstPoints: Point[] = [
      [0, 0],
      [0, dstHeight],
      [dstWidth, dstHeight],
      [dstWidth, 0],
    ];
    const H = computeHomography(srcPoints, dstPoints);
    const warped = warpImageData(srcImage, H, dstWidth, dstHeight);

    // Compare the results
    const diff = compareImageData(resized, warped);

    // The methods use different interpolation (bilinear vs nearest-neighbor)
    // so we expect some differences, but they should be relatively small
    console.log('Resize vs Homography comparison:', {
      maxDiff: diff.maxDiff,
      meanDiff: diff.meanDiff
    });

    // Mean difference should be small (bilinear is generally smoother than nearest-neighbor)
    // We're testing that both methods are scaling to the same dimensions
    // The actual pixel values will differ due to interpolation methods
    expect(diff.meanDiff).toBeLessThan(50); // Loose bound due to different interpolation
  });

  test('resize should be functionally equivalent for identity scaling', () => {
    const srcImage = createMockImageData(100, 100, [200, 150, 100, 255]);

    // Identity scaling (same size)
    const resized = resizeImageData(srcImage, 100, 100);

    const diff = compareImageData(srcImage, resized);

    // For identity scaling, results should be very close
    expect(diff.meanDiff).toBeLessThan(2);
  });
});

