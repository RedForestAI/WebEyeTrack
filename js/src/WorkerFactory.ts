export interface WorkerConfig {
  workerUrl?: string;
  modelPath?: string;
}

export function createWebEyeTrackWorker(config?: WorkerConfig): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error(
      'Web Workers are not supported in this environment. ' +
      'WebEyeTrackProxy requires a browser environment with Worker support.'
    );
  }

  if (config?.workerUrl) {
    try {
      return new Worker(config.workerUrl);
    } catch (error) {
      throw new Error(
        `Failed to load worker from custom URL: ${config.workerUrl}. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Auto-detect worker location from script URL
  try {
    // Priority 1: Try to detect from document.currentScript (works in browser main thread)
    if (typeof document !== 'undefined' && document.currentScript) {
      const scriptUrl = (document.currentScript as HTMLScriptElement).src;
      const baseUrl = scriptUrl.substring(0, scriptUrl.lastIndexOf('/'));
      const workerUrl = `${baseUrl}/webeyetrack.worker.js`;
      return new Worker(workerUrl);
    }

    // Priority 2: Try to detect from self.location (works in Web Workers)
    if (typeof self !== 'undefined' && self.location) {
      const baseUrl = self.location.origin + self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/'));
      const workerUrl = `${baseUrl}/webeyetrack.worker.js`;
      return new Worker(workerUrl);
    }

    // Priority 3: Relative path fallback (works if worker is in same directory as bundle)
    const workerUrl = './webeyetrack.worker.js';
    return new Worker(workerUrl);
  } catch (error) {
    throw new Error(
      'Failed to automatically detect worker location.\n\n' +
      'Please provide an explicit workerUrl in the configuration:\n' +
      '  new WebEyeTrackProxy(webcamClient, {\n' +
      '    workerUrl: "/path/to/webeyetrack.worker.js"\n' +
      '  })\n\n' +
      'Make sure webeyetrack.worker.js is publicly accessible from your application.\n\n' +
      'Common solutions:\n' +
      '- Vite: Copy worker to public/ directory\n' +
      '- webpack: Use CopyWebpackPlugin to copy worker to dist/\n' +
      '- Custom: Serve worker from CDN or static assets\n\n' +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
