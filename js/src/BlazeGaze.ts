import * as tf from '@tensorflow/tfjs';
import { IDisposable } from './IDisposable';

// References
// https://js.tensorflow.org/api/latest/#class:LayersModel

export default class BlazeGaze implements IDisposable {
    // private model: tf.GraphModel | null = null;
    private model: tf.LayersModel | null = null;  // Use LayersModel for tf.loadLayersModel
    private _disposed: boolean = false;

    constructor() {
        // Optionally trigger model load in constructor
    }

    async loadModel(modelPath?: string): Promise<void> {
        // Use provided modelPath or default to origin-relative path
        const path = modelPath || `${self.location.origin}/web/model.json`;
        try {
            // Load model from local directory (adjust path if needed)
            this.model = await tf.loadLayersModel(path);
            console.log('✅ BlazeGaze model loaded successfully from:', path);
        } catch (error) {
            console.error('❌ Error loading BlazeGaze model from path:', path);
            console.error(error);
            throw error;
        }

        // Freeze the ``cnn_model`` layers but keep the gaze_MLP trainable
        this.model.getLayer('cnn_encoder').trainable = false;
    }

    predict(image: tf.Tensor, head_vector: tf.Tensor, face_origin_3d: tf.Tensor): tf.Tensor {
        if (!this.model) {
            throw new Error('Model not loaded. Call loadModel() first.');
        }

        const inputList: tf.Tensor[] = [image, head_vector, face_origin_3d];

        // Run inference
        const output = this.model.predict(inputList) as tf.Tensor | tf.Tensor[];  // GraphModel always returns Tensor or Tensor[]

        if (Array.isArray(output)) {
            return output[0];  // Return the first tensor if multiple
        }

        return output;
    }

    /**
     * Disposes the TensorFlow.js model and releases GPU/CPU memory.
     */
    dispose(): void {
        if (this._disposed) {
            return;
        }

        if (this.model) {
            this.model.dispose();
            this.model = null;
        }

        this._disposed = true;
    }

    /**
     * Returns true if dispose() has been called.
     */
    get isDisposed(): boolean {
        return this._disposed;
    }
}
