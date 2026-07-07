/**
 * Unit tests for WebEyeTrack buffer management
 * Tests clearCalibrationBuffer(), clearClickstreamPoints(), and resetAllBuffers()
 */

import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu';

import WebEyeTrack from './WebEyeTrack';

// Helper to create mock tensor data for buffer
function createMockBufferData(): {
  eyePatches: tf.Tensor;
  headVectors: tf.Tensor;
  faceOrigins3D: tf.Tensor;
} {
  return {
    eyePatches: tf.zeros([1, 128, 512, 3]),
    headVectors: tf.zeros([1, 3]),
    faceOrigins3D: tf.zeros([1, 3])
  };
}

// Helper to manually add data to buffer (bypasses adapt() which requires browser APIs)
function addToCalibBuffer(tracker: WebEyeTrack, numPoints: number = 1) {
  for (let i = 0; i < numPoints; i++) {
    const mockData = createMockBufferData();
    tracker.calibData.calibSupportX.push(mockData);
    tracker.calibData.calibSupportY.push(tf.zeros([1, 2]));
    tracker.calibData.calibTimestamps.push(Date.now());
  }
}

function addToClickBuffer(tracker: WebEyeTrack, numPoints: number = 1) {
  for (let i = 0; i < numPoints; i++) {
    const mockData = createMockBufferData();
    tracker.calibData.clickSupportX.push(mockData);
    tracker.calibData.clickSupportY.push(tf.zeros([1, 2]));
    tracker.calibData.clickTimestamps.push(Date.now());
  }
}

describe('WebEyeTrack Buffer Management', () => {
  let tracker: WebEyeTrack;

  beforeAll(async () => {
    // Set TensorFlow.js backend to CPU for testing
    await tf.setBackend('cpu');
    await tf.ready();
  });

  beforeEach(() => {
    // Create a new tracker instance for each test
    tracker = new WebEyeTrack(5, 60, 4, 5);
  });

  afterEach(() => {
    // Clean up tracker after each test
    if (tracker && !tracker.isDisposed) {
      tracker.dispose();
    }
  });

  describe('clearCalibrationBuffer()', () => {
    test('should clear calibration buffer and reset affine matrix', () => {
      // Add calibration points directly to buffer
      addToCalibBuffer(tracker, 2);

      // Verify calibration buffer has data
      expect(tracker.calibData.calibSupportX.length).toBe(2);

      // Clear calibration buffer
      tracker.clearCalibrationBuffer();

      // Verify buffer is cleared
      expect(tracker.calibData.calibSupportX.length).toBe(0);
      expect(tracker.calibData.calibSupportY.length).toBe(0);
      expect(tracker.calibData.calibTimestamps.length).toBe(0);
    });

    test('should not affect clickstream buffer', () => {
      // Add clickstream points
      addToClickBuffer(tracker, 3);

      const clickCountBefore = tracker.calibData.clickSupportX.length;
      expect(clickCountBefore).toBe(3);

      // Clear calibration buffer
      tracker.clearCalibrationBuffer();

      // Verify clickstream buffer is unchanged
      expect(tracker.calibData.clickSupportX.length).toBe(clickCountBefore);
    });

    test('should be idempotent (safe to call multiple times)', () => {
      addToCalibBuffer(tracker, 1);

      tracker.clearCalibrationBuffer();
      tracker.clearCalibrationBuffer();
      tracker.clearCalibrationBuffer();

      // Should not throw error
      expect(tracker.calibData.calibSupportX.length).toBe(0);
    });
  });

  describe('clearClickstreamPoints()', () => {
    test('should clear clickstream buffer', () => {
      // Add clickstream points
      addToClickBuffer(tracker, 2);

      // Verify clickstream buffer has data
      expect(tracker.calibData.clickSupportX.length).toBe(2);

      // Clear clickstream buffer
      tracker.clearClickstreamPoints();

      // Verify buffer is cleared
      expect(tracker.calibData.clickSupportX.length).toBe(0);
      expect(tracker.calibData.clickSupportY.length).toBe(0);
      expect(tracker.calibData.clickTimestamps.length).toBe(0);
    });

    test('should not affect calibration buffer', () => {
      // Add calibration points
      addToCalibBuffer(tracker, 3);

      const calibCountBefore = tracker.calibData.calibSupportX.length;
      expect(calibCountBefore).toBe(3);

      // Clear clickstream buffer
      tracker.clearClickstreamPoints();

      // Verify calibration buffer is unchanged
      expect(tracker.calibData.calibSupportX.length).toBe(calibCountBefore);
    });

    test('should be idempotent (safe to call multiple times)', () => {
      addToClickBuffer(tracker, 1);

      tracker.clearClickstreamPoints();
      tracker.clearClickstreamPoints();
      tracker.clearClickstreamPoints();

      // Should not throw error
      expect(tracker.calibData.clickSupportX.length).toBe(0);
    });
  });

  describe('resetAllBuffers()', () => {
    test('should clear both calibration and clickstream buffers', () => {
      // Add both types of points
      addToCalibBuffer(tracker, 2);
      addToClickBuffer(tracker, 3);

      // Verify both buffers have data
      expect(tracker.calibData.calibSupportX.length).toBe(2);
      expect(tracker.calibData.clickSupportX.length).toBe(3);

      // Reset all buffers
      tracker.resetAllBuffers();

      // Verify both buffers are cleared
      expect(tracker.calibData.calibSupportX.length).toBe(0);
      expect(tracker.calibData.calibSupportY.length).toBe(0);
      expect(tracker.calibData.calibTimestamps.length).toBe(0);
      expect(tracker.calibData.clickSupportX.length).toBe(0);
      expect(tracker.calibData.clickSupportY.length).toBe(0);
      expect(tracker.calibData.clickTimestamps.length).toBe(0);
    });

    test('should be equivalent to calling both clear methods', () => {
      // Add data to both buffers
      addToCalibBuffer(tracker, 1);
      addToClickBuffer(tracker, 1);

      // Reset all
      tracker.resetAllBuffers();

      // Should have same effect as calling both individually
      expect(tracker.calibData.calibSupportX.length).toBe(0);
      expect(tracker.calibData.clickSupportX.length).toBe(0);
    });

    test('should be idempotent', () => {
      addToCalibBuffer(tracker, 1);
      addToClickBuffer(tracker, 1);

      tracker.resetAllBuffers();
      tracker.resetAllBuffers();
      tracker.resetAllBuffers();

      // Should not throw error
      expect(tracker.calibData.calibSupportX.length).toBe(0);
      expect(tracker.calibData.clickSupportX.length).toBe(0);
    });
  });

  describe('Memory leak prevention', () => {
    test('clearCalibrationBuffer should dispose tensors', () => {
      const tensorCountBefore = tf.memory().numTensors;

      // Add calibration points
      addToCalibBuffer(tracker, 2);

      const tensorCountAfterAdd = tf.memory().numTensors;
      expect(tensorCountAfterAdd).toBeGreaterThan(tensorCountBefore);

      // Clear buffer (should dispose tensors)
      tracker.clearCalibrationBuffer();

      const tensorCountAfterClear = tf.memory().numTensors;

      // Tensor count should decrease back to original
      expect(tensorCountAfterClear).toBeLessThan(tensorCountAfterAdd);
    });

    test('clearClickstreamPoints should dispose tensors', () => {
      const tensorCountBefore = tf.memory().numTensors;

      // Add clickstream points
      addToClickBuffer(tracker, 2);

      const tensorCountAfterAdd = tf.memory().numTensors;
      expect(tensorCountAfterAdd).toBeGreaterThan(tensorCountBefore);

      // Clear buffer (should dispose tensors)
      tracker.clearClickstreamPoints();

      const tensorCountAfterClear = tf.memory().numTensors;

      // Tensor count should decrease back to original
      expect(tensorCountAfterClear).toBeLessThan(tensorCountAfterAdd);
    });

    test('resetAllBuffers should dispose all tensors from both buffers', () => {
      const tensorCountBefore = tf.memory().numTensors;

      // Add to both buffers
      addToCalibBuffer(tracker, 2);
      addToClickBuffer(tracker, 3);

      const tensorCountAfterAdd = tf.memory().numTensors;
      expect(tensorCountAfterAdd).toBeGreaterThan(tensorCountBefore);

      // Reset all buffers
      tracker.resetAllBuffers();

      const tensorCountAfterReset = tf.memory().numTensors;

      // Tensor count should decrease significantly
      expect(tensorCountAfterReset).toBeLessThan(tensorCountAfterAdd);
    });
  });

  describe('Re-calibration workflow', () => {
    test('should support re-calibration with resetAllBuffers', () => {
      // Initial calibration
      addToCalibBuffer(tracker, 2);
      addToClickBuffer(tracker, 3);

      expect(tracker.calibData.calibSupportX.length).toBe(2);
      expect(tracker.calibData.clickSupportX.length).toBe(3);

      // User clicks "Recalibrate"
      tracker.resetAllBuffers();

      // Buffers should be empty
      expect(tracker.calibData.calibSupportX.length).toBe(0);
      expect(tracker.calibData.clickSupportX.length).toBe(0);

      // New calibration
      addToCalibBuffer(tracker, 4);

      // Only new calibration should be present
      expect(tracker.calibData.calibSupportX.length).toBe(4);
      expect(tracker.calibData.clickSupportX.length).toBe(0);
    });
  });
});
