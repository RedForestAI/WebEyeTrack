# @koyukan/webeyetrack - Enhanced WebEyeTrack

[![NPM Version](https://img.shields.io/npm/v/@koyukan/webeyetrack)](https://www.npmjs.com/package/@koyukan/webeyetrack) [![GitHub License](https://img.shields.io/github/license/koyukan/webeyetrack)](#license)

> **Enhanced fork** of [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack) with professional-grade features, performance optimizations, and improved developer experience.
>
> See [main README](../README.md#attribution--enhancements) for full attribution and list of enhancements.

## About

This is the TypeScript/JavaScript implementation of WebEyeTrack, enhanced with:
- 🚀 Performance optimizations (3× faster in some operations)
- 🧠 Memory management and leak prevention
- 📦 Modern build system (ESM/CJS/UMD)
- 🔒 TypeScript strict mode
- 🎯 Professional-grade calibration system
- 📊 Real-time analysis and visualization tools

The implementation uses a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) to offload AI inference to an isolated thread, keeping the main UI thread responsive. The package is framework-independent and works with React, Vue, Angular, or vanilla JavaScript.

Additionally, you can combine `@koyukan/webeyetrack` with [webfixrt](https://github.com/redforestai/webfixrt) for online fixation detection to extract fixation and saccade information as a real-time stream.

### Original Research

Created by Eduardo Davalos, Yike Zhang, and collaborators at Vanderbilt University.
- **Paper**: [WEBEYETRACK: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization](https://arxiv.org/abs/2508.19544)
- **Original Repository**: https://github.com/RedForestAI/WebEyeTrack
- **Funding**: Institute of Education Sciences, U.S. Department of Education

# Getting Started

Install the npm package running the following command:

```bash
npm install @koyukan/webeyetrack
```

# Usage

We highly recommend that any developer interested in interested in using WebEyeTrack to take a look into our [minimal code example using React](./examples/minimal-example/). This should help understand how to incorporate WebEyeTrack into your codebase.

To use WebEyeTrack, we provide a webcam client solution to support the streaming of frames into the tracker.

```ts
const webcamClient = new WebcamClient('video'); // id of HTMLVideoElement
const webEyeTrackProxy = new WebEyeTrackProxy(webcamClient);
```

Then you define the callback function once gaze estimation results are available:

```ts
webEyeTrackProxy.onGazeResults = (gazeResult: GazeResult) => {
  console.log(gazeResult)
}
```

Then make sure to copy and paste the [``web``](./examples/minimal-example/public/web) folder into your ``public`` folder of your application. The ``web`` folder includes the trained TF.js model weights for the BlazeGaze gaze-estimation model.

### GazeResult Interface (TypeScript)

| Field Name       | Type                          | Shape / Values      | Description                                         |
|------------------|-------------------------------|----------------------|-----------------------------------------------------|
| facialLandmarks  | `NormalizedLandmark[]`        | [N, 5]              | Facial landmarks, normalized to screen or image     |
| faceRt           | `Matrix`                      | [4, 4]                  | Face rotation-translation matrix                   |
| faceBlendshapes  | `Classifications[]`           | [N, 1]              | Blendshape classification outputs                  |
| eyePatch         | `ImageData`                   | [H=512, W=128, 3]           | RGB image of the eye region                        |
| headVector       | `number[]`                    | [3]                 | Head direction vector in camera coordinates        |
| faceOrigin3D     | `number[]`                    | [3] (X, Y, Z)       | 3D origin of the face in space                     |
| metric_transform | `Matrix`                      | [4, 4]              | Transformation matrix applied to reconstructed face|
| gazeState        | `'open'` \| `'closed'`        | Enum-like Literal   | Current eye state (e.g., blink detection)          |
| normPog          | `number[]`                    | [2] (X, Y)          | Normalized point-of-gaze on the screen             |
| durations        | `Record<string, number>`      | —                   | Timing metadata for each processing stage (seconds)|
| timestamp        | `number`                      | —                   | Timestamp in milliseconds of video start (relative) |

The normalized PoG is from range ``[[-0.5, 0.5], [-0.5, 0.5]]`` where the origin ``(0,0)`` is located at the center of the screen. The positive Y axis is pointing downwards and the positive X axis is pointing toward the right.

# Memory Management

WebEyeTrack uses TensorFlow.js for real-time gaze estimation, which requires careful memory management to prevent memory leaks during long-running sessions. All core classes implement the `IDisposable` interface for proper resource cleanup.

## Key Principles

### 1. Always Call `dispose()` When Done

All WebEyeTrack components must be explicitly disposed to release GPU/CPU resources:

```typescript
import { WebcamClient, WebEyeTrackProxy } from '@koyukan/webeyetrack';

// Initialize
const webcamClient = new WebcamClient('webcam');
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient);

// ... use the tracker ...

// Clean up when done
eyeTrackProxy.dispose();  // Terminates worker, removes event listeners
webcamClient.dispose();   // Stops webcam, cancels animation frames
```

### 2. React Integration Pattern

For React applications, use the cleanup function in `useEffect`:

```typescript
useEffect(() => {
  let webcamClient: WebcamClient | null = null;
  let eyeTrackProxy: WebEyeTrackProxy | null = null;

  const initialize = async () => {
    webcamClient = new WebcamClient('webcam');
    eyeTrackProxy = new WebEyeTrackProxy(webcamClient);
    // ... setup callbacks ...
  };

  initialize();

  // Cleanup on unmount
  return () => {
    eyeTrackProxy?.dispose();
    webcamClient?.dispose();
  };
}, []);
```

### 3. Error Handling with Error Boundaries

Wrap your application with `MemoryCleanupErrorBoundary` to ensure cleanup on errors:

```typescript
import { MemoryCleanupErrorBoundary } from '@koyukan/webeyetrack';

function App() {
  return (
    <MemoryCleanupErrorBoundary onCleanup={() => console.log('Cleaned up')}>
      <YourApp />
    </MemoryCleanupErrorBoundary>
  );
}
```

### 4. Memory Monitoring

Use the `MemoryMonitor` utility to track TensorFlow.js memory usage:

```typescript
import { MemoryMonitor } from '@koyukan/webeyetrack';

const monitor = new MemoryMonitor();
monitor.captureBaseline();

// ... perform calibration ...

const report = monitor.checkForLeaks();
console.log(`Tensor leak: ${report.tensorLeak} tensors`);
console.log(`Byte leak: ${report.byteLeak} bytes`);
```

## Best Practices

- **Dispose in reverse order**: Dispose child components before parent components
- **Check `isDisposed`**: Verify disposal state before operations
- **Long sessions**: Monitor memory periodically during extended sessions
- **Component unmounting**: Always dispose resources in React cleanup functions
- **Worker threads**: Ensure workers receive disposal messages before termination

## Common Issues

### Memory Growing Over Time
- Ensure `dispose()` is called on all instances
- Check for circular references preventing garbage collection
- Monitor calibration data accumulation

### Tensors Not Released
- Verify all TensorFlow.js operations use `tf.tidy()` where appropriate
- Ensure custom tensor operations call `tf.dispose()`
- Check that model predictions are properly disposed after use

## Resources Managed

The following resources are automatically managed through `dispose()`:

- **TensorFlow.js tensors**: Model weights, calibration data, intermediate computations
- **Event listeners**: Window events, mouse handlers, message handlers
- **Animation frames**: RequestAnimationFrame loops for video processing
- **Media streams**: Webcam tracks and video elements
- **Worker threads**: Background processing threads

# Worker Configuration

WebEyeTrack runs the eye-tracking model in a Web Worker for better performance. The worker is automatically managed, but you can customize its loading behavior for advanced use cases.

## Default Behavior

By default, WebEyeTrackProxy automatically loads the worker:

```typescript
const webcamClient = new WebcamClient('webcam');
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient);
// Worker is loaded automatically
```

## Custom Worker URL

For production deployments or CDN hosting, specify a custom worker URL:

```typescript
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient, {
  workerUrl: '/static/webeyetrack.worker.js'
});
```

## Vite Configuration

When using Vite, you need to:
1. Exclude webeyetrack from dependency optimization (to avoid webpack-specific code)
2. Copy the worker to your public directory

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { copyFileSync } from 'fs'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    {
      name: 'copy-worker',
      buildStart() {
        const src = resolve(__dirname, 'node_modules/@koyukan/webeyetrack/dist/webeyetrack.worker.js')
        const dest = resolve(__dirname, 'public/webeyetrack.worker.js')
        copyFileSync(src, dest)
      }
    }
  ],
  optimizeDeps: {
    exclude: ['@koyukan/webeyetrack']  // Important: prevents Vite from pre-bundling
  }
})
```

Then specify the worker URL in your application:

```typescript
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient, {
  workerUrl: '/webeyetrack.worker.js'
});
```

## Webpack / Create React App

Webpack-based projects (including Create React App) automatically bundle the worker. No configuration needed:

```typescript
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient);
// Worker is bundled inline automatically
```

## CDN Deployment

When serving from a CDN, ensure `webeyetrack.worker.js` is accessible:

```typescript
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient, {
  workerUrl: 'https://cdn.example.com/webeyetrack.worker.js'
});
```

## Worker Bundle Details

- **Size**: ~961KB (minified)
- **Dependencies**: TensorFlow.js (bundled), MediaPipe (loaded from CDN)
- **Format**: UMD (works in all environments)
- **Source Maps**: Available for debugging

## Troubleshooting

### Worker fails to load

If you see worker loading errors:

1. Check that `webeyetrack.worker.js` is accessible from your application
2. Verify the worker URL path is correct (absolute or relative to your HTML)
3. Check browser console for CORS errors
4. Ensure the worker file is served with correct MIME type (`application/javascript`)

### Example error and fix:

```
Error: Failed to create WebEyeTrack worker
```

**Solution**: Provide explicit worker URL:

```typescript
const eyeTrackProxy = new WebEyeTrackProxy(webcamClient, {
  workerUrl: window.location.origin + '/webeyetrack.worker.js'
});
```

# Examples

You can find implementation examples in the [Examples](./examples/) folder. These examples should provide further guidance in how to use and integrated WebEyeTrack into your application. Contributions are welcome for new examples -- especially illustrating how to incorporate WebEyeTrack to other frameworks. Missing examples for the following frameworks:
1. VueJS/NuxtJS
2. Svelte
3. Angular

# Acknowledgements

The research reported here was supported by the Institute of Education Sciences, U.S. Department of Education, through Grant R305A150199 and R305A210347 to Vanderbilt University. The opinions expressed are those of the authors and do not represent views of the Institute or the U.S. Department of Education.

# Reference

If you use this work in your research, please cite us using the following:

```bibtex
@misc{davalos2025webeyetrack,
	title={WEBEYETRACK: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization},
	author={Eduardo Davalos and Yike Zhang and Namrata Srivastava and Yashvitha Thatigotla and Jorge A. Salas and Sara McFadden and Sun-Joo Cho and Amanda Goodwin and Ashwin TS and Gautam Biswas},
	year={2025},
	eprint={2508.19544},
	archivePrefix={arXiv},
	primaryClass={cs.CV},
	url={https://arxiv.org/abs/2508.19544}
}
```

# License

WebEyeTrack is open-sourced under the [MIT License](LICENSE), which permits personal, academic, and commercial use with proper attribution. Feel free to use, modify, and distribute the project.