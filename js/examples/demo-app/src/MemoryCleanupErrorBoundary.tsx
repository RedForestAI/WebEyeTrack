import React, { Component, ReactNode, ErrorInfo } from 'react';
import * as tf from '@tensorflow/tfjs';

interface Props {
  children: ReactNode;
  onCleanup?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * React error boundary that ensures proper resource cleanup on errors.
 * Disposes all TensorFlow.js resources and calls custom cleanup handler.
 */
export default class MemoryCleanupErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by MemoryCleanupErrorBoundary:', error, errorInfo);

    // Perform resource cleanup
    this.cleanupResources();
  }

  cleanupResources() {
    try {
      // Call custom cleanup handler if provided
      if (this.props.onCleanup) {
        this.props.onCleanup();
      }

      // Force TensorFlow.js cleanup
      // Dispose all variables and reset engine state
      tf.disposeVariables();

      console.log('Resources cleaned up after error');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen bg-red-50">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Something went wrong
            </h1>
            <p className="text-gray-700 mb-4">
              An error occurred while running the eye tracker. Resources have been cleaned up.
            </p>
            <button
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
            {this.state.error && (
              <details className="mt-4 text-left text-sm">
                <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                  Error details
                </summary>
                <pre className="mt-2 p-2 bg-gray-100 rounded overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
