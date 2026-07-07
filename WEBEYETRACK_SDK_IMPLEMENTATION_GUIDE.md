# WebEyeTrack SDK - Complete Implementation Guide

**Based on**: `js/examples/demo-app/` implementation
**Version**: WebEyeTrack 0.0.2
**Last Updated**: 2025-10-22

---

## Table of Contents

1. [Overview](#overview)
2. [Coordinate System](#coordinate-system)
3. [Initial 4-Point Calibration](#initial-4-point-calibration)
4. [Clickstream Calibration](#clickstream-calibration)
5. [SDK API Reference](#sdk-api-reference)
6. [Complete Implementation Example](#complete-implementation-example)
7. [Parameter Reference Table](#parameter-reference-table)

---

## Overview

WebEyeTrack uses a **two-tiered calibration approach**:

1. **Initial 4-Point Calibration**: Manual calibration with explicit user attention at 4 fixed points
2. **Clickstream Calibration**: Automatic continuous improvement from user clicks during normal usage

Both systems feed into the same **MAML (Model-Agnostic Meta-Learning)** adaptation pipeline but use **separate buffers** with different eviction policies.

### Key Principle
**Calibration points are persistent** (never auto-evicted), while **clickstream points are ephemeral** (TTL + FIFO eviction).

---

## Coordinate System

### Normalized Coordinates

WebEyeTrack uses a **normalized coordinate system** for all gaze points and calibration targets:

- **Range**: `[-0.5, 0.5]` for both X and Y axes
- **Origin**: `(0, 0)` at screen center
- **Axes**:
  - Positive X → Right
  - Positive Y → Down
  - Negative X → Left
  - Negative Y → Up

### Coordinate Conversions

**Normalized to Pixels** (`calibrationHelpers.ts:102-111`):
```typescript
function normalizedToPixels(
  normalized: { x: number; y: number },
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  return {
    x: (normalized.x + 0.5) * screenWidth,
    y: (normalized.y + 0.5) * screenHeight
  };
}
```

**Pixels to Normalized** (`calibrationHelpers.ts:122-132`):
```typescript
function pixelsToNormalized(
  x: number,
  y: number,
  screenWidth: number,
  screenHeight: number
): { x: number; y: number } {
  return {
    x: x / screenWidth - 0.5,
    y: y / screenHeight - 0.5
  };
}
```

**Examples**:
- Screen center `(960px, 540px)` on 1920×1080 → `(0, 0)` normalized
- Top-left corner `(0px, 0px)` → `(-0.5, -0.5)` normalized
- Bottom-right `(1920px, 1080px)` → `(0.5, 0.5)` normalized

---

## Initial 4-Point Calibration

### Grid Positions

**Source**: `types/calibration.ts:93-98`

```typescript
export const DEFAULT_CALIBRATION_POSITIONS = [
  { x: -0.4, y: -0.4 },  // Top-left
  { x: 0.4, y: -0.4 },   // Top-right
  { x: -0.4, y: 0.4 },   // Bottom-left
  { x: 0.4, y: 0.4 },    // Bottom-right
];
```

### Why 4 Points?

Affine transformation requires **minimum 3 points** (6 degrees of freedom: 2 scale, 2 rotation/shear, 2 translation). Using **4 points** provides:
- Overdetermined system (more robust)
- Corner coverage for screen calibration
- Matches Python implementation

### Sample Collection Flow

**Total Time per Point**: ~3.5 seconds

1. **Animation Phase** (2000ms):
   - Calibration dot appears **red**
   - Gradually transitions to **white** (CSS transition)
   - User focuses on **crosshair center**
   - **No samples collected during this phase**

2. **Collection Phase** (1500ms):
   - Dot is fully **white**
   - Gaze samples collected at frame rate (~60 FPS)
   - **Target**: 25 samples per point
   - **Actual**: ~20-30 samples (depends on frame rate)
   - Samples stored in array

**Source**: `types/calibration.ts:104-111`
```typescript
export const DEFAULT_CALIBRATION_CONFIG = {
  numPoints: 4,
  samplesPerPoint: 25,
  animationDuration: 2000,   // Red → white transition
  collectionDuration: 1500,  // White phase sampling
  stepsInner: 10,            // MAML gradient steps
  innerLR: 1e-4,             // Learning rate
};
```

### Statistical Filtering

**Purpose**: Select the **single best sample** from 20-30 collected samples per point.

**Algorithm** (`calibrationHelpers.ts:50-92`):

1. Extract all predicted gaze points from samples
2. Compute **mean gaze point** (meanX, meanY)
3. Compute **standard deviation** (for logging)
4. Find sample whose prediction is **closest to mean** (Euclidean distance)
5. Return that **single sample** (outliers removed)

**Code Reference**:
```typescript
export function filterSamples(samples: CalibrationSample[]): CalibrationSample | null {
  // Extract predictions
  const predictions = samples.map(sample => ({
    x: sample.gazeResult.normPog[0],
    y: sample.gazeResult.normPog[1]
  }));

  // Compute mean
  const meanX = mean(predictions.map(p => p.x));
  const meanY = mean(predictions.map(p => p.y));
  const meanPoint = { x: meanX, y: meanY };

  // Find closest sample to mean
  let closestSample = samples[0];
  let minDistance = distance(predictions[0], meanPoint);

  for (let i = 1; i < samples.length; i++) {
    const dist = distance(predictions[i], meanPoint);
    if (dist < minDistance) {
      minDistance = dist;
      closestSample = samples[i];
    }
  }

  return closestSample;
}
```

**Result**: For 4 calibration points, we collect ~100 samples total but only use **4 filtered samples** (one per point) for adaptation.

### Adaptation Parameters

**CRITICAL**: The demo-app uses **Python default parameters**, NOT JavaScript defaults!

**Source**: `useCalibration.ts:226-234`
```typescript
await tracker.adapt(
  eyePatches,
  headVectors,
  faceOrigins3D,
  normPogs,
  10,       // stepsInner: Python default (Python main.py:250)
  1e-4,     // innerLR: Python default (Python main.py:251)
  'calib'   // ptType: calibration points (persistent)
);
```

| Parameter | Value | Python Reference | Notes |
|-----------|-------|------------------|-------|
| `stepsInner` | **10** | `python/demo/main.py:250` | NOT JS default (1) |
| `innerLR` | **1e-4** | `python/demo/main.py:251` | NOT JS default (1e-5) |
| `ptType` | **'calib'** | `python/demo/main.py:252` | Marks as calibration point |

**Why These Values?**
- `stepsInner=10`: More gradient descent iterations → better convergence
- `innerLR=1e-4`: Higher learning rate than JS default → faster adaptation
- These were tuned in the Python implementation for optimal calibration quality

### Buffer Management

**Source**: `WebEyeTrack.ts:94-96`

```typescript
public maxCalibPoints: number = 4;    // Max calibration points
public maxClickPoints: number = 5;    // Max clickstream points
public clickTTL: number = 60;         // TTL in seconds for clicks
```

**Calibration Buffer Characteristics**:
- **Persistent**: Never auto-evicted
- **Manual clearing only**: Via `clearCalibrationBuffer()` or `resetAllBuffers()`
- **Overflow handling**: Error logged, adaptation skipped if exceeds `maxCalibPoints`
- **Purpose**: High-quality manual calibration data should persist

**Buffer Clearing** (`useCalibration.ts:101-111`):
```typescript
// IMPORTANT: Clear both buffers before re-calibration
if (tracker.resetAllBuffers) {
  console.log('Resetting all buffers (calibration + clickstream)');
  tracker.resetAllBuffers();  // Recommended for re-calibration
} else if (tracker.clearCalibrationBuffer) {
  tracker.clearCalibrationBuffer();  // Fallback (only clears calib)
}
```

### Complete Calibration Workflow

**From User Perspective**:

1. User clicks **"Calibrate"** button
2. **Instructions screen** (3 seconds):
   - "Look at each dot as it appears"
   - "Focus on the crosshair center"
   - "Keep your head still"
3. **Point 1** (Top-left):
   - Red dot appears at `(-0.4, -0.4)`
   - Transitions to white (2s)
   - Samples collected (1.5s) → ~25 samples
   - Statistical filtering → 1 best sample
4. **Point 2** (Top-right): Same as Point 1
5. **Point 3** (Bottom-left): Same as Point 1
6. **Point 4** (Bottom-right): Same as Point 1
7. **Processing** (~1 second):
   - 4 filtered samples prepared
   - `tracker.adapt()` called with stepsInner=10, innerLR=1e-4
   - Affine matrix computed (requires 4 points)
   - MAML adaptation training
8. **Success message** (2 seconds):
   - "Calibration Complete!"
   - Auto-closes

**Total Time**: ~18-20 seconds

---

## Clickstream Calibration

### Automatic Click Detection

**Built-in Feature**: `WebEyeTrackProxy` automatically listens to **all window clicks**.

**Source**: `WebEyeTrackProxy.ts:85-94`
```typescript
// Click handler is automatically registered in constructor
this.clickHandler = (e: MouseEvent) => {
  // Convert pixel coords to normalized
  const normX = (e.clientX / window.innerWidth) - 0.5;
  const normY = (e.clientY / window.innerHeight) - 0.5;
  console.log(`Click at (${normX}, ${normY})`);

  // Send to worker
  this.worker.postMessage({ type: 'click', payload: { x: normX, y: normY }});
};

window.addEventListener('click', this.clickHandler);
```

**What This Means**:
- No manual event handlers needed in your application
- Every click on the page is captured
- Coordinates auto-converted to normalized range
- Sent to worker for processing

### Click Debouncing

**Purpose**: Prevent duplicate/noisy clicks from contaminating calibration.

**Source**: `WebEyeTrack.ts:333-346`

```typescript
handleClick(x: number, y: number) {
  // Temporal debounce: 1000ms minimum between clicks
  if (this.latestMouseClick && (Date.now() - this.latestMouseClick.timestamp < 1000)) {
    console.log("Click ignored due to debounce");
    this.latestMouseClick = { x, y, timestamp: Date.now() };
    return;
  }

  // Spatial debounce: 0.05 normalized distance minimum
  if (this.latestMouseClick &&
      Math.abs(x - this.latestMouseClick.x) < 0.05 &&
      Math.abs(y - this.latestMouseClick.y) < 0.05) {
    console.log("Click ignored due to proximity");
    this.latestMouseClick = { x, y, timestamp: Date.now() };
    return;
  }

  // Accept click and adapt
  this.latestMouseClick = { x, y, timestamp: Date.now() };
  // ... adaptation code ...
}
```

**Debounce Rules**:
1. **Time-based**: Minimum 1000ms (1 second) between accepted clicks
2. **Space-based**: Minimum 0.05 normalized distance (~100px on 1920×1080)

**Example**: If user clicks at `(0.1, 0.2)` at time T, then:
- Click at `(0.12, 0.21)` at T+500ms → **REJECTED** (too soon + too close)
- Click at `(0.3, 0.4)` at T+500ms → **REJECTED** (too soon, even if far)
- Click at `(0.12, 0.21)` at T+1500ms → **REJECTED** (far enough in time, but too close in space)
- Click at `(0.3, 0.4)` at T+1500ms → **ACCEPTED** (far enough in both time and space)

### Adaptation Parameters

**Source**: `WebEyeTrack.ts:353-361`

```typescript
this.adapt(
  [this.latestGazeResult?.eyePatch],
  [this.latestGazeResult?.headVector],
  [this.latestGazeResult?.faceOrigin3D],
  [[x, y]],
  10,      // stepsInner: matches Python main.py:183
  1e-4,    // innerLR: matches Python main.py:184
  'click'  // ptType: marks as clickstream point
);
```

**Parameters**:
| Parameter | Value | Python Reference | Same as 4-Point? |
|-----------|-------|------------------|------------------|
| `stepsInner` | **10** | `python/demo/main.py:183` | ✅ YES |
| `innerLR` | **1e-4** | `python/demo/main.py:184` | ✅ YES |
| `ptType` | **'click'** | `python/demo/main.py:185` | ❌ NO ('calib' vs 'click') |

**Key Insight**: Clickstream uses the **same adaptation parameters** as 4-point calibration, only the `ptType` differs.

### Buffer Management

**Source**: `WebEyeTrack.ts:94-96`

```typescript
public maxCalibPoints: number = 4;    // Calibration buffer size
public maxClickPoints: number = 5;    // Clickstream buffer size
public clickTTL: number = 60;         // Click TTL in seconds
```

**Clickstream Buffer Characteristics**:
- **Ephemeral**: Automatically evicted
- **TTL eviction**: Points older than 60 seconds removed
- **FIFO eviction**: If > 5 points, oldest removed first
- **Separate from calibration**: Calibration points never affected by click pruning

### Eviction Algorithm

**Source**: `WebEyeTrack.ts:273-327`

```typescript
pruneCalibData() {
  // === CALIBRATION BUFFER: Never pruned ===
  // (Calibration points persist for entire session)

  // === CLICKSTREAM BUFFER: TTL + FIFO ===
  const currentTime = Date.now();
  const ttl = this.clickTTL * 1000;  // 60 seconds = 60000ms

  // Step 1: Remove expired clicks (TTL)
  const validIndices = this.calibData.clickTimestamps
    .map((timestamp, index) => ({ timestamp, index }))
    .filter(item => currentTime - item.timestamp <= ttl)
    .map(item => item.index);

  // Dispose expired tensors
  // ... tensor disposal code ...

  // Step 2: Apply FIFO if still over maxClickPoints
  if (this.calibData.clickSupportX.length > this.maxClickPoints) {
    const numToRemove = this.calibData.clickSupportX.length - this.maxClickPoints;
    // Remove oldest clicks
    // ... tensor disposal code ...
    // Keep only last maxClickPoints
    this.calibData.clickSupportX = this.calibData.clickSupportX.slice(-this.maxClickPoints);
    this.calibData.clickSupportY = this.calibData.clickSupportY.slice(-this.maxClickPoints);
    this.calibData.clickTimestamps = this.calibData.clickTimestamps.slice(-this.maxClickPoints);
  }
}
```

**Eviction Flow**:
1. **TTL Check**: Remove all clicks older than 60 seconds
2. **FIFO Check**: If still > 5 clicks, remove oldest until count = 5
3. **Tensor Disposal**: Properly dispose removed tensors (prevents memory leaks)

**Example Timeline**:
```
T=0s:   Click A added → Buffer: [A]
T=10s:  Click B added → Buffer: [A, B]
T=20s:  Click C added → Buffer: [A, B, C]
T=30s:  Click D added → Buffer: [A, B, C, D]
T=40s:  Click E added → Buffer: [A, B, C, D, E]
T=50s:  Click F added → Buffer: [A, B, C, D, E, F] (exceeds maxClickPoints=5)
        → FIFO: Remove A → Buffer: [B, C, D, E, F]
T=70s:  Adaptation triggered → TTL check
        → B is 60s old (T=10s), removed
        → Buffer: [C, D, E, F]
```

### Disabling Clickstream

If you want manual calibration only (no automatic click adaptation):

```typescript
// Option 1: Remove click handler after initialization
window.removeEventListener('click', tracker.clickHandler);

// Option 2: Set maxClickPoints to 0
const tracker = new WebEyeTrack(0, 60, 4, 0);

// Option 3: Clear clickstream periodically
setInterval(() => {
  tracker.clearClickstreamPoints();
}, 10000);  // Clear every 10 seconds
```

---

## SDK API Reference

### WebEyeTrackProxy

**Constructor**:
```typescript
constructor(
  webcamClient: WebcamClient,
  workerConfig?: {
    workerUrl?: string;
  }
)
```

**Example**:
```typescript
const webcamClient = new WebcamClient('webcam');
const tracker = new WebEyeTrackProxy(webcamClient, {
  workerUrl: '/webeyetrack.worker.js'
});
```

### Core Methods

#### `adapt()`

Perform calibration adaptation with collected gaze data.

**Signature** (`WebEyeTrackProxy.ts:115-143`):
```typescript
async adapt(
  eyePatches: ImageData[],      // Eye region images
  headVectors: number[][],      // 3D head direction vectors [N, 3]
  faceOrigins3D: number[][],    // 3D face positions [N, 3]
  normPogs: number[][],         // Ground truth gaze points [N, 2]
  stepsInner: number = 1,       // Gradient descent iterations (default: 1)
  innerLR: number = 1e-5,       // Learning rate (default: 1e-5)
  ptType: 'calib' | 'click' = 'calib'  // Point type
): Promise<void>
```

**Parameters**:
- `eyePatches`: Array of ImageData objects (eye patches from GazeResult)
- `headVectors`: 3D head direction vectors `[[x1, y1, z1], [x2, y2, z2], ...]`
- `faceOrigins3D`: 3D face positions `[[x1, y1, z1], [x2, y2, z2], ...]`
- `normPogs`: Ground truth calibration points in normalized coords `[[x1, y1], [x2, y2], ...]`
- `stepsInner`: Number of MAML gradient descent steps (recommend: **10** for calibration)
- `innerLR`: Learning rate (recommend: **1e-4** for calibration)
- `ptType`:
  - `'calib'`: Persistent calibration points (never evicted)
  - `'click'`: Ephemeral clickstream points (TTL + FIFO)

**Returns**: `Promise<void>` (resolves when adaptation completes)

**Example - 4-Point Calibration**:
```typescript
// Prepare filtered samples (4 points)
const { eyePatches, headVectors, faceOrigins3D, normPogs } = prepareAdaptationData(filteredSamples);

// Perform adaptation with Python defaults
await tracker.adapt(
  eyePatches,
  headVectors,
  faceOrigins3D,
  normPogs,
  10,       // stepsInner (Python default)
  1e-4,     // innerLR (Python default)
  'calib'   // ptType
);
```

**Example - Single Click**:
```typescript
// User clicked at screen position (800px, 600px) on 1920×1080
const normX = (800 / 1920) - 0.5;  // ≈ -0.083
const normY = (600 / 1080) - 0.5;  // ≈ 0.056

await tracker.adapt(
  [latestGazeResult.eyePatch],
  [latestGazeResult.headVector],
  [latestGazeResult.faceOrigin3D],
  [[normX, normY]],
  10,       // Same as calibration
  1e-4,     // Same as calibration
  'click'   // Different ptType
);
```

#### `resetAllBuffers()`

Clears both calibration and clickstream buffers. **Recommended for re-calibration**.

**Signature** (`WebEyeTrackProxy.ts:178-181`):
```typescript
resetAllBuffers(): void
```

**Usage**:
```typescript
// User clicks "Recalibrate" button
tracker.resetAllBuffers();  // Clear all previous data

// Then start new calibration
startCalibration();
```

**What It Does**:
1. Disposes all calibration tensors
2. Disposes all clickstream tensors
3. Resets affine transformation matrix
4. Clears both buffer arrays

#### `clearCalibrationBuffer()`

Clears only calibration buffer, preserves clickstream.

**Signature** (`WebEyeTrackProxy.ts:150-153`):
```typescript
clearCalibrationBuffer(): void
```

**Usage**:
```typescript
// Clear calibration but keep recent clicks
tracker.clearCalibrationBuffer();
```

#### `clearClickstreamPoints()`

Clears only clickstream buffer, preserves calibration.

**Signature** (`WebEyeTrackProxy.ts:163-166`):
```typescript
clearClickstreamPoints(): void
```

**Usage**:
```typescript
// Remove stale clicks while keeping calibration
tracker.clearClickstreamPoints();
```

### WebEyeTrack

**Constructor** (`WebEyeTrack.ts:98-114`):
```typescript
constructor(
  maxPoints: number = 5,           // Deprecated: use maxClickPoints
  clickTTL: number = 60,           // Click TTL in seconds
  maxCalibPoints?: number,         // Max calibration points (default: 4)
  maxClickPoints?: number          // Max clickstream points (default: 5)
)
```

**Example**:
```typescript
// Default configuration
const tracker = new WebEyeTrack();
// maxCalibPoints: 4
// maxClickPoints: 5
// clickTTL: 60 seconds

// Custom configuration
const tracker = new WebEyeTrack(
  5,   // deprecated maxPoints (use maxClickPoints instead)
  120, // clickTTL: 2 minutes
  9,   // maxCalibPoints: 9-point calibration
  10   // maxClickPoints: 10 recent clicks
);
```

### Callback: `onGazeResults`

Set callback to receive gaze tracking results.

**Signature**:
```typescript
tracker.onGazeResults = (gazeResult: GazeResult) => {
  // Handle gaze result
};
```

**GazeResult Interface** (`types.ts`):
```typescript
interface GazeResult {
  facialLandmarks: NormalizedLandmark[];
  faceRt: Matrix;
  faceBlendshapes: any;
  eyePatch: ImageData;              // Eye region image
  headVector: number[];             // [x, y, z]
  faceOrigin3D: number[];           // [x, y, z]
  metric_transform: Matrix;
  gazeState: 'open' | 'closed';
  normPog: number[];                // [x, y] normalized gaze point
  durations: {
    faceLandmarker: number;
    prepareInput: number;
    blazeGaze: number;
    kalmanFilter: number;
    total: number;
  };
  timestamp: number;
}
```

**Example**:
```typescript
webEyeTrackProxy.onGazeResults = (gazeResult: GazeResult) => {
  // Store latest result for click calibration
  latestGazeResult = gazeResult;

  // Display gaze point
  const gazeX = (gazeResult.normPog[0] + 0.5) * window.innerWidth;
  const gazeY = (gazeResult.normPog[1] + 0.5) * window.innerHeight;

  setGaze({ x: gazeX, y: gazeY, gazeState: gazeResult.gazeState });
};
```

---

## Complete Implementation Example

### Minimal Setup

```typescript
import { WebcamClient, WebEyeTrackProxy, GazeResult } from 'webeyetrack';

// 1. Initialize webcam
const webcamClient = new WebcamClient('webcam-video-id');

// 2. Initialize tracker proxy
const tracker = new WebEyeTrackProxy(webcamClient, {
  workerUrl: '/webeyetrack.worker.js'
});

// 3. Set gaze callback
tracker.onGazeResults = (gazeResult: GazeResult) => {
  console.log('Gaze:', gazeResult.normPog);
};

// Clickstream calibration is now automatic!
// Every click will trigger adaptation.
```

### React Component with 4-Point Calibration

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { WebcamClient, WebEyeTrackProxy, GazeResult } from 'webeyetrack';
import CalibrationOverlay from './components/CalibrationOverlay';

function App() {
  const [showCalibration, setShowCalibration] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<WebEyeTrackProxy | null>(null);

  useEffect(() => {
    // Initialize tracker
    async function init() {
      if (!videoRef.current) return;

      const webcamClient = new WebcamClient(videoRef.current.id);
      const tracker = new WebEyeTrackProxy(webcamClient, {
        workerUrl: '/webeyetrack.worker.js'
      });

      trackerRef.current = tracker;

      // Handle gaze results
      tracker.onGazeResults = (gazeResult: GazeResult) => {
        const x = (gazeResult.normPog[0] + 0.5) * window.innerWidth;
        const y = (gazeResult.normPog[1] + 0.5) * window.innerHeight;
        setGaze({ x, y });
      };
    }

    init();

    // Cleanup
    return () => {
      if (trackerRef.current) {
        trackerRef.current.dispose();
      }
    };
  }, []);

  return (
    <>
      {/* Webcam */}
      <video
        id="webcam"
        ref={videoRef}
        autoPlay
        playsInline
      />

      {/* Calibrate Button */}
      <button onClick={() => setShowCalibration(true)}>
        Calibrate
      </button>

      {/* Gaze Dot */}
      <div
        style={{
          position: 'absolute',
          left: gaze.x,
          top: gaze.y,
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: 'red',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none'
        }}
      />

      {/* Calibration Overlay */}
      {showCalibration && trackerRef.current && (
        <CalibrationOverlay
          tracker={trackerRef.current}
          onComplete={() => {
            console.log('Calibration complete');
            setShowCalibration(false);
          }}
          onCancel={() => {
            console.log('Calibration cancelled');
            setShowCalibration(false);
          }}
        />
      )}
    </>
  );
}

export default App;
```

### Custom Calibration Flow

If you want to implement your own calibration UI:

```typescript
import { WebEyeTrackProxy, GazeResult } from 'webeyetrack';

async function performCalibration(tracker: WebEyeTrackProxy) {
  // Define calibration points
  const calibrationPoints = [
    { x: -0.4, y: -0.4 },  // Top-left
    { x: 0.4, y: -0.4 },   // Top-right
    { x: -0.4, y: 0.4 },   // Bottom-left
    { x: 0.4, y: 0.4 },    // Bottom-right
  ];

  // Clear previous calibration
  tracker.resetAllBuffers();

  const collectedSamples: {
    eyePatches: ImageData[];
    headVectors: number[][];
    faceOrigins3D: number[][];
    normPogs: number[][];
  } = {
    eyePatches: [],
    headVectors: [],
    faceOrigins3D: [],
    normPogs: []
  };

  // For each calibration point
  for (const point of calibrationPoints) {
    // Show calibration target at point position
    showCalibrationTarget(point);

    // Wait for animation (2 seconds)
    await sleep(2000);

    // Collect samples (1.5 seconds)
    const samples: GazeResult[] = [];
    const startTime = Date.now();

    while (Date.now() - startTime < 1500) {
      const sample = await waitForNextGazeResult();
      samples.push(sample);
      await sleep(16);  // ~60 FPS
    }

    // Filter samples (select best one)
    const bestSample = filterSamples(samples);  // Use statistical filtering

    if (bestSample) {
      collectedSamples.eyePatches.push(bestSample.eyePatch);
      collectedSamples.headVectors.push(bestSample.headVector);
      collectedSamples.faceOrigins3D.push(bestSample.faceOrigin3D);
      collectedSamples.normPogs.push([point.x, point.y]);
    }
  }

  // Perform adaptation
  await tracker.adapt(
    collectedSamples.eyePatches,
    collectedSamples.headVectors,
    collectedSamples.faceOrigins3D,
    collectedSamples.normPogs,
    10,       // stepsInner (Python default)
    1e-4,     // innerLR (Python default)
    'calib'   // ptType
  );

  console.log('Calibration complete!');
}

// Helper function for statistical filtering
function filterSamples(samples: GazeResult[]): GazeResult | null {
  if (samples.length === 0) return null;

  // Compute mean prediction
  const meanX = samples.reduce((sum, s) => sum + s.normPog[0], 0) / samples.length;
  const meanY = samples.reduce((sum, s) => sum + s.normPog[1], 0) / samples.length;

  // Find closest sample to mean
  let bestSample = samples[0];
  let minDist = Infinity;

  for (const sample of samples) {
    const dx = sample.normPog[0] - meanX;
    const dy = sample.normPog[1] - meanY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist) {
      minDist = dist;
      bestSample = sample;
    }
  }

  return bestSample;
}
```

---

## Parameter Reference Table

### Calibration Configuration

| Parameter | Default Value | Source | Description | Python Equivalent |
|-----------|---------------|--------|-------------|-------------------|
| **Grid Points** |
| `numPoints` | `4` | `calibration.ts:105` | Number of calibration points | Python: 4 |
| Point 1 | `[-0.4, -0.4]` | `calibration.ts:94` | Top-left position | Python: `[-0.4, -0.4]` |
| Point 2 | `[0.4, -0.4]` | `calibration.ts:95` | Top-right position | Python: `[0.4, -0.4]` |
| Point 3 | `[-0.4, 0.4]` | `calibration.ts:96` | Bottom-left position | Python: `[-0.4, 0.4]` |
| Point 4 | `[0.4, 0.4]` | `calibration.ts:97` | Bottom-right position | Python: `[0.4, 0.4]` |
| **Sample Collection** |
| `samplesPerPoint` | `25` | `calibration.ts:106` | Target samples per point | Python: ~25 |
| `animationDuration` | `2000` ms | `calibration.ts:107` | Red → white transition | Python: 2000ms |
| `collectionDuration` | `1500` ms | `calibration.ts:108` | Sample collection time | Python: 1500ms |
| Actual samples | `~20-30` | Variable | Depends on frame rate | Python: ~25 |
| **Filtering** |
| Algorithm | Mean + closest | `calibrationHelpers.ts:50` | Statistical filtering | Python: Same |
| Samples used | `1` per point | - | Only best sample | Python: Same |
| **Adaptation (4-Point)** |
| `stepsInner` | `10` | `calibration.ts:109` | MAML gradient steps | Python: 10 (`main.py:250`) |
| `innerLR` | `1e-4` | `calibration.ts:110` | Learning rate | Python: 1e-4 (`main.py:251`) |
| `ptType` | `'calib'` | `useCalibration.ts:233` | Point type | Python: 'calib' |
| **Clickstream** |
| `stepsInner` | `10` | `WebEyeTrack.ts:358` | MAML gradient steps | Python: 10 (`main.py:183`) |
| `innerLR` | `1e-4` | `WebEyeTrack.ts:359` | Learning rate | Python: 1e-4 (`main.py:184`) |
| `ptType` | `'click'` | `WebEyeTrack.ts:360` | Point type | Python: 'click' |
| Time debounce | `1000` ms | `WebEyeTrack.ts:333` | Min time between clicks | Python: Not specified |
| Spatial debounce | `0.05` norm | `WebEyeTrack.ts:341` | Min distance between clicks | Python: Not specified |
| **Buffer Management** |
| `maxCalibPoints` | `4` | `WebEyeTrack.ts:94` | Max calibration points | Python: Not limited |
| `maxClickPoints` | `5` | `WebEyeTrack.ts:95` | Max clickstream points | Python: Not specified |
| `clickTTL` | `60` seconds | `WebEyeTrack.ts:96` | Click time-to-live | Python: Not specified |
| Calib eviction | Never | - | Persistent | Python: Same |
| Click eviction | TTL + FIFO | `WebEyeTrack.ts:273` | Automatic | Python: Not specified |

### Coordinate System

| Concept | Value | Source | Description |
|---------|-------|--------|-------------|
| **Normalized Range** | `[-0.5, 0.5]` | Convention | Both X and Y |
| **Origin** | `(0, 0)` | - | Screen center |
| **Pixel to Norm (X)** | `x/width - 0.5` | `calibrationHelpers.ts:129` | Conversion formula |
| **Pixel to Norm (Y)** | `y/height - 0.5` | `calibrationHelpers.ts:130` | Conversion formula |
| **Norm to Pixel (X)** | `(x + 0.5) * width` | `calibrationHelpers.ts:108` | Conversion formula |
| **Norm to Pixel (Y)** | `(y + 0.5) * height` | `calibrationHelpers.ts:109` | Conversion formula |

### UI/UX Timing

| Event | Duration | Source | Description |
|-------|----------|--------|-------------|
| Instructions display | `3000` ms | `useCalibration.ts:126` | Before first point |
| Dot animation | `2000` ms | `CalibrationDot.tsx:33` | Red → white |
| Sample collection | `1500` ms | `calibration.ts:108` | After white |
| Processing | `~1000` ms | Variable | Adaptation time |
| Success message | `2000` ms | `useCalibration.ts:249` | Before auto-close |
| **Total per point** | `~3500` ms | - | Animation + collection |
| **Total calibration** | `~18-20s` | - | 4 points + overhead |

### SDK Defaults (JavaScript)

| Parameter | SDK Default | Demo-App Override | Reason for Override |
|-----------|-------------|-------------------|---------------------|
| `stepsInner` | `1` | `10` | Match Python, better convergence |
| `innerLR` | `1e-5` | `1e-4` | Match Python, faster adaptation |
| `ptType` | `'calib'` | Varies | N/A |
| `maxCalibPoints` | `4` | `4` | - |
| `maxClickPoints` | `5` | `5` | - |
| `clickTTL` | `60` | `60` | - |

---

## Key Takeaways

### For Initial 4-Point Calibration:

1. **Use Python defaults**: `stepsInner=10`, `innerLR=1e-4` (NOT SDK defaults)
2. **Collect many, use one**: Collect ~25 samples per point, filter to 1 best sample
3. **Clear buffers first**: Always call `resetAllBuffers()` before re-calibration
4. **4 points minimum**: Required for affine transformation (6 DOF)
5. **Coordinate system**: Normalized `[-0.5, 0.5]`, origin at center

### For Clickstream Calibration:

1. **Automatic**: No manual event handlers needed
2. **Same parameters**: Use same `stepsInner=10`, `innerLR=1e-4` as 4-point
3. **Debouncing**: 1000ms time + 0.05 normalized distance
4. **Ephemeral**: Clicks evicted after 60s or when buffer full (5 max)
5. **Buffer separation**: Click and calibration buffers are independent

### Common Pitfalls:

❌ **Don't use SDK default parameters** (`stepsInner=1`, `innerLR=1e-5`) for calibration
✅ **Do use Python defaults** (`stepsInner=10`, `innerLR=1e-4`)

❌ **Don't forget to clear buffers** before re-calibration
✅ **Do call** `resetAllBuffers()` before starting new calibration

❌ **Don't use all collected samples**
✅ **Do filter** to 1 best sample per calibration point

❌ **Don't mix coordinate systems**
✅ **Do use normalized** `[-0.5, 0.5]` consistently

---

## References

- **Demo App**: `js/examples/demo-app/`
- **Python Reference**: `python/demo/main.py:195-277`, `python/demo/calibration_widget.py`
- **Research Paper**: [WebEyeTrack arXiv](https://arxiv.org/abs/2508.19544)
- **Calibration Theory**: Paper Section 3.3 - "Few-Shot Personalization"

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Maintainer**: Based on demo-app implementation analysis
