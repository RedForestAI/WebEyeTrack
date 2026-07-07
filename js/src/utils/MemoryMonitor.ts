import * as tf from '@tensorflow/tfjs';

/**
 * Report containing memory usage statistics and leak detection information.
 */
export interface MemoryReport {
  /** Number of tensors leaked since baseline */
  tensorLeak: number;
  /** Bytes leaked since baseline */
  byteLeak: number;
  /** Whether memory tracking is reliable (false if TensorFlow.js couldn't track all allocations) */
  unreliable: boolean;
  /** Current total tensor count */
  currentTensors: number;
  /** Current total bytes allocated */
  currentBytes: number;
  /** Baseline tensor count (if captured) */
  baselineTensors: number | null;
  /** Baseline bytes (if captured) */
  baselineBytes: number | null;
}

/**
 * Utility class for monitoring TensorFlow.js memory usage and detecting leaks.
 *
 * Usage:
 * ```typescript
 * const monitor = new MemoryMonitor();
 * monitor.captureBaseline();
 *
 * // ... perform operations ...
 *
 * const report = monitor.checkForLeaks();
 * if (report.tensorLeak > 0) {
 *   console.warn(`Detected ${report.tensorLeak} leaked tensors`);
 * }
 * ```
 */
export class MemoryMonitor {
  private baseline: tf.MemoryInfo | null = null;

  /**
   * Captures the current TensorFlow.js memory state as a baseline.
   * Call this before performing operations you want to monitor.
   */
  captureBaseline(): void {
    this.baseline = tf.memory();
  }

  /**
   * Resets the baseline to null, clearing any previous capture.
   */
  resetBaseline(): void {
    this.baseline = null;
  }

  /**
   * Checks for memory leaks by comparing current state to the baseline.
   * If no baseline was captured, leak values will be negative.
   *
   * @returns MemoryReport with detailed memory statistics
   */
  checkForLeaks(): MemoryReport {
    const current = tf.memory();

    return {
      tensorLeak: current.numTensors - (this.baseline?.numTensors ?? current.numTensors),
      byteLeak: current.numBytes - (this.baseline?.numBytes ?? current.numBytes),
      unreliable: current.unreliable ?? false,
      currentTensors: current.numTensors,
      currentBytes: current.numBytes,
      baselineTensors: this.baseline?.numTensors ?? null,
      baselineBytes: this.baseline?.numBytes ?? null,
    };
  }

  /**
   * Returns the current TensorFlow.js memory state without comparison.
   */
  getCurrentMemory(): tf.MemoryInfo {
    return tf.memory();
  }

  /**
   * Logs a formatted memory report to the console.
   * Useful for debugging memory issues during development.
   */
  logReport(): void {
    const report = this.checkForLeaks();
    console.log('=== TensorFlow.js Memory Report ===');
    console.log(`Current Tensors: ${report.currentTensors}`);
    console.log(`Current Bytes: ${(report.currentBytes / 1024 / 1024).toFixed(2)} MB`);

    if (report.baselineTensors !== null) {
      console.log(`Baseline Tensors: ${report.baselineTensors}`);
      console.log(`Tensor Leak: ${report.tensorLeak > 0 ? '+' : ''}${report.tensorLeak}`);
      console.log(`Byte Leak: ${report.byteLeak > 0 ? '+' : ''}${(report.byteLeak / 1024).toFixed(2)} KB`);
    } else {
      console.log('No baseline captured');
    }

    if (report.unreliable) {
      console.warn('Warning: Memory tracking may be unreliable');
    }
    console.log('===================================');
  }
}
