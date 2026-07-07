import { Component, type ReactNode, type ErrorInfo } from 'react';
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
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#fee',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '32px',
            maxWidth: '400px'
          }}>
            <h1 style={{ color: '#c33', marginBottom: '16px' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#666', marginBottom: '16px' }}>
              An error occurred while running the eye tracker. Resources have been cleaned up.
            </p>
            <button
              style={{
                padding: '8px 16px',
                backgroundColor: '#c33',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
