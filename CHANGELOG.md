# Changelog

All notable changes to this enhanced fork of WebEyeTrack are documented in this file.

This fork is maintained by Huseyin Koyukan and is based on the original [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack) by Eduardo Davalos et al.

## [1.0.4] - 2026-07-07

### Fixed

- Published sourcemaps for the ESM and CJS bundles now embed the original TypeScript sources (`inlineSources` in the Rollup/CJS TypeScript configs). Previously `index.cjs.map`, `index.esm.js.map`, and `index.esm.min.js.map` referenced `src/*.ts` files that are not shipped in the package, causing harmless but noisy "Failed to parse source map" warnings in consumer builds (e.g. CRA/webpack via source-map-loader). The UMD and worker maps were already self-contained.
- No runtime changes: all five distributed bundles are byte-identical to 1.0.3.

### Security

- Dev/build dependency updates from the repo-wide npm audit remediation: `@rollup/plugin-terser` 0.4.4 → 1.0.0 (pulls `serialize-javascript` ≥7.0.5), plus lockfile-level fixes for `form-data`, `js-yaml`, and `@babel/core`. None of these affect the published artifact or its runtime dependency ranges.

## [1.0.3] - 2026-05-12

### Changed

- Calibration animation redesigned with concentric rings.
- Dropped unused `mathjs` and `npm-run-all` dependencies from the published package.

## [1.0.2] - 2025-12-06

### Added

- Configurable `modelPath` to support hosting under a subdirectory (e.g. GitHub Pages).

### Fixed

- Resolved all ESLint warnings for CI builds; regenerated lockfile against the npm registry.

## [1.0.1] - 2025-11-14

### Fixed

- Removed webpack-specific `worker-loader` syntax from the ESM build so non-webpack bundlers can consume it.

## [1.0.0] - 2025-11-13

### Fork Created

This is the first stable release of `@koyukan/webeyetrack`, an enhanced fork of the original WebEyeTrack research implementation.

**Fork Point**: Diverged from [RedForestAI/WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack) on 2025-10-17 (commit: 14719ad)

### Added

#### Infrastructure & Build System
- Modern build pipeline with Rollup for multi-format distribution (ESM/CJS/UMD)
- Worker-specific Webpack configuration for optimized worker bundles
- Build validation scripts to ensure distribution correctness
- Multi-format TypeScript configuration
- NPM packaging improvements with proper entry points (`dist/index.cjs`, `dist/index.esm.js`)
- `.npmignore` for cleaner package distribution

#### Code Quality & Type Safety
- Enabled TypeScript strict mode across entire codebase
- Created centralized type declaration infrastructure
- Removed all `@ts-ignore` comments (fixed underlying type issues)
- Comprehensive type definitions for all public APIs
- Type-safe interfaces for calibration, gaze results, and configuration

#### Memory Management
- `IDisposable` interface for consistent resource cleanup patterns
- `MemoryMonitor` utility for detecting TensorFlow.js memory leaks
- Automatic tensor disposal in all components (WebcamClient, WebEyeTrack, WebEyeTrackProxy)
- `MemoryCleanupErrorBoundary` React component for error-safe cleanup
- Fixed memory leaks in optimizer (proper disposal of gradients and optimizers)
- Comprehensive memory management documentation

#### Performance Optimizations
- TensorFlow.js warmup for shader pre-compilation (eliminates first-run slowness)
- Eliminated redundant perspective matrix inversions in eye patch extraction
- Optimized eye patch extraction using bilinear resize instead of homography
- Canvas caching in WebcamClient (prevents repeated canvas creation)
- Performance test suite for regression detection

#### Calibration System
- Interactive 4-point calibration UI with visual feedback
- Clickstream calibration with automatic click capture
- Separate buffer architecture (calibration points never evicted, clickstream has TTL)
- Calibration point persistence across sessions
- Parameters aligned with Python reference implementation (stepsInner=10, innerLR=1e-4)
- `CalibrationDot`, `CalibrationOverlay`, `CalibrationProgress` React components
- `useCalibration` hook for React integration
- Comprehensive calibration documentation (CALIBRATION.md)

#### Advanced Features
- Video-fixation synchronization for offline analysis
- Gaze recording functionality with timestamped data
- Analysis dashboard for visualizing gaze patterns
- `VideoPlayerWithOverlay` component for playback analysis
- `useGazeRecording` hook for recording management
- Buffer management tests for calibration and clickstream

#### Worker Loading Flexibility
- `WorkerFactory` with multiple loading strategies
- Support for different bundlers (Webpack, Vite, Rollup)
- Custom worker URL configuration
- Automatic worker path resolution
- Documentation for Vite, Webpack, and CDN deployment scenarios

#### Documentation
- Reorganized JavaScript-specific documentation structure
- Worker configuration guide with bundler-specific examples
- Memory management best practices documentation
- SDK implementation guide (WEBEYETRACK_SDK_IMPLEMENTATION_GUIDE.md)
- Calibration system documentation with examples
- Enhanced README files with clear usage instructions
- TypeDoc-ready code comments

#### Development Experience
- Comprehensive example applications:
  - Minimal example (basic integration)
  - Demo app (full-featured with calibration and recording)
- Build validation scripts
- Memory monitoring tools for development
- Better error messages and debugging support

### Changed

#### Breaking Changes
- Package name changed from `webeyetrack` to `@koyukan/webeyetrack`
- Minimum TypeScript version now 5.0+ (for strict mode support)

#### API Enhancements
- All major classes now implement `IDisposable` (WebcamClient, WebEyeTrackProxy, WebEyeTrack)
- `WebEyeTrackProxy` constructor accepts optional `workerUrl` parameter
- Enhanced `GazeResult` interface with better typing
- Calibration methods now properly typed with explicit return values

#### Performance Improvements
- Eye patch extraction is ~3× faster (bilinear resize vs homography)
- First prediction is ~2× faster (shader pre-compilation)
- Reduced memory pressure through systematic disposal
- Smaller bundle size with optimized builds

### Fixed

- Memory leaks in MAML training loop (optimizers not disposed)
- Memory leaks in WebcamClient (animation frames not cancelled)
- Memory leaks in WebEyeTrackProxy (event listeners not removed)
- Type safety issues in calibration data management
- Worker loading issues in Vite-based projects
- Perspective matrix inversion being called on every frame
- Canvas recreation on every frame in webcam client

### Documentation

- Added comprehensive attribution to original authors and research paper
- Documented federal funding acknowledgment (IES/Dept of Education)
- Created detailed CHANGELOG documenting all enhancements
- Updated LICENSE with dual copyright (original + fork)
- Enhanced README files with fork relationship explanation

---

## Original WebEyeTrack

For the history of the original WebEyeTrack implementation, see the [upstream repository](https://github.com/RedForestAI/WebEyeTrack).

**Original Authors**: Eduardo Davalos, Yike Zhang, Namrata Srivastava, Yashvitha Thatigotla, Jorge A. Salas, Sara McFadden, Sun-Joo Cho, Amanda Goodwin, Ashwin TS, and Gautam Biswas

**Research Paper**: [WEBEYETRACK: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization](https://arxiv.org/abs/2508.19544)

**License**: MIT License (maintained in this fork)

---

## Versioning

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for backward-compatible functionality additions
- **PATCH** version for backward-compatible bug fixes

The version number starts at 1.0.0 to indicate this is a stable, production-ready fork with substantial enhancements beyond the original 0.0.2 release.

---

## Attribution

This fork maintains full attribution to the original WebEyeTrack project:

**Original Copyright**: (c) 2025 Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas
**Fork Enhancements**: (c) 2025 Huseyin Koyukan
**License**: MIT License
