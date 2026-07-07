# WebEyeTrack

Created by <a href="https://edavalosanaya.github.io" target="_blank">Eduardo Davalos</a>, <a href="https://scholar.google.com/citations?user=_E0SGAkAAAAJ&hl=en" target="_blank">Yike Zhang</a>, <a href="https://scholar.google.com/citations?user=GWvdYIoAAAAJ&hl=en&oi=ao" target="_blank">Namrata Srivastava</a>, <a href="https://www.linkedin.com/in/yashvitha/" target="_blank">Yashvitha Thatigolta</a>, <a href="" target="_blank">Jorge A. Salas</a>, <a href="https://www.linkedin.com/in/sara-mcfadden-93162a4/" target="_blank">Sara McFadden</a>, <a href="https://scholar.google.com/citations?user=0SHxelgAAAAJ&hl=en" target="_blank">Cho Sun-Joo</a>, <a href="https://scholar.google.com/citations?user=dZ8X7mMAAAAJ&hl=en" target="_blank">Amanda Goodwin</a>, <a href="https://sites.google.com/view/ashwintudur/home" target="_blank">Ashwin TS</a>, and <a href="https://scholar.google.com/citations?user=-m5wrTkAAAAJ&hl=en" target="_blank">Guatam Biswas</a> from <a href="https://wp0.vanderbilt.edu/oele/" target="_blank">Vanderbilt University</a>, <a href="https://redforestai.github.io" target="_blank">Trinity University</a>, and <a href="https://knotlab.github.io/KnotLab/" target="_blank">St. Mary's University</a>

### [Project](https://redforestai.github.io/WebEyeTrack) | [Paper](https://arxiv.org/abs/2508.19544) | [Demo](https://koyukan.github.io/WebEyeTrack/demo/)

<p></p>

[![NPM Version](https://img.shields.io/npm/v/@koyukan/webeyetrack)](https://www.npmjs.com/package/@koyukan/webeyetrack) [![GitHub License](https://img.shields.io/github/license/koyukan/webeyetrack)](#license)

> **Note**: This is an enhanced fork of [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack) with professional-grade features, performance optimizations, and improved developer experience. See [Attribution & Enhancements](#attribution--enhancements) below for details.

WebEyeTrack is a framework that uses a lightweight CNN-based neural network to predict the ``(x,y)`` gaze point on the screen. The framework provides both a Python and JavaScript/TypeScript (client-side) versions to support research/testing and deployment via TS/JS. It performs few-shot gaze estimation by collecting samples on-device to adapt the model to account for unseen persons.

## Attribution & Enhancements

### About This Fork

This repository is an **enhanced fork** of the original [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack) research implementation created by Eduardo Davalos, Yike Zhang, and collaborators at Vanderbilt University, Trinity University, and St. Mary's University.

**Original WebEyeTrack Research:**
- **Paper**: [WEBEYETRACK: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization](https://arxiv.org/abs/2508.19544)
- **Authors**: Eduardo Davalos, Yike Zhang, Namrata Srivastava, Yashvitha Thatigotla, Jorge A. Salas, Sara McFadden, Sun-Joo Cho, Amanda Goodwin, Ashwin TS, and Gautam Biswas
- **Funding**: Supported by the Institute of Education Sciences, U.S. Department of Education (Grants R305A150199 and R305A210347)
- **Repository**: https://github.com/RedForestAI/WebEyeTrack
- **License**: MIT License

### Fork Enhancements

This fork adds substantial improvements to the original WebEyeTrack implementation:

**Infrastructure & Build System:**
- ✅ Modern build pipeline with Rollup for ESM/CJS/UMD distribution
- ✅ Multi-format support (CommonJS, ES Modules, UMD)
- ✅ Optimized worker loading with flexible bundler support
- ✅ NPM package improvements with proper entry points

**Code Quality & Type Safety:**
- ✅ TypeScript strict mode enabled throughout
- ✅ Comprehensive type definitions and interfaces
- ✅ Removed all @ts-ignore comments
- ✅ Type-safe API surface

**Memory Management:**
- ✅ IDisposable interface for resource cleanup
- ✅ MemoryMonitor utility for leak detection
- ✅ Automatic tensor disposal in all components
- ✅ Memory cleanup error boundaries for React
- ✅ Fixed optimizer memory leaks

**Performance Optimizations:**
- ✅ TensorFlow.js warmup for shader pre-compilation
- ✅ Eliminated redundant perspective matrix inversions
- ✅ Optimized eye patch extraction (bilinear resize instead of homography)
- ✅ Canvas caching in WebcamClient
- ✅ Performance test suite

**Calibration System:**
- ✅ Interactive 4-point calibration interface
- ✅ Clickstream calibration with separate buffer architecture
- ✅ Calibration point persistence (never evicted)
- ✅ Parameters aligned with Python reference implementation
- ✅ Comprehensive calibration documentation

**Advanced Features:**
- ✅ Video-fixation synchronization
- ✅ Gaze recording and analysis tools
- ✅ Real-time visualization components
- ✅ Analysis dashboard

**Developer Experience:**
- ✅ Reorganized JavaScript-specific documentation
- ✅ Worker configuration guides
- ✅ Memory management documentation
- ✅ Complete SDK implementation guide
- ✅ Example applications with best practices

### Package Installation

**JavaScript/TypeScript** (Enhanced Fork):
```bash
npm install @koyukan/webeyetrack
```

**Python** (Original):
```bash
pip install webeyetrack
```

For detailed usage instructions, see the respective README files:
- [JavaScript `@koyukan/webeyetrack` package](./js)
- [Python `webeyetrack` package](./python)

# Getting Started

Deciding which version of WebEyeTrack depends on your purpose and target platform. Here is a table to help you determine which version to use: 

| Feature              | Python Version                       | JavaScript Version                     |
|----------------------|--------------------------------------|----------------------------------------|
| **Purpose**          | Training, Research, and Testing      | Deployment and Production              |
| **Primary Use Case** | Model development and experimentation | Real-time inference in the browser     |
| **Supported Devices**| CPU & GPU (desktop/server)           | CPU (Web browser, mobile)    |
| **Model Access**     | Full access to model internals       | Optimized for on-device inference and training |
| **Extensibility**    | Highly customizable (e.g., few-shot learning, adaptation) | Minimal, focused on performance        |
| **Frameworks**       | TensorFlow / Keras                   | TensorFlow.js                          |
| **Data Handling**    | Direct access to datasets and logs   | Webcam stream, UI input                |

Go to the README (links below) to the corresponding Python/JS version to get started using these packages.

* [Python ``webeyetrack`` PYPI package](./python) - Original package
* [JavaScript ``@koyukan/webeyetrack`` NPM package](./js) - Enhanced fork

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