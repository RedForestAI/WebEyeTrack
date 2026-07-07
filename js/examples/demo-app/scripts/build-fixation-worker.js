#!/usr/bin/env node
/**
 * Build script for FixationWorker
 *
 * Compiles the TypeScript worker file to a standalone JavaScript file
 * that can be loaded in the browser.
 */

const { buildSync } = require('esbuild');
const path = require('path');
const fs = require('fs');

const workerSource = path.join(__dirname, '../src/workers/FixationWorker.ts');
const workerOutput = path.join(__dirname, '../public/fixation.worker.js');

// Check if source file exists
if (!fs.existsSync(workerSource)) {
  console.error(`❌ Worker source not found: ${workerSource}`);
  process.exit(1);
}

try {
  buildSync({
    entryPoints: [workerSource],
    bundle: true,
    outfile: workerOutput,
    format: 'iife', // Self-executing for worker context
    target: 'es2020',
    platform: 'browser',
    minify: false, // Keep readable for debugging
    sourcemap: true,
    logLevel: 'info',
  });

  console.log('✅ Built fixation.worker.js');
} catch (err) {
  console.error('❌ Worker build failed:', err);
  process.exit(1);
}
