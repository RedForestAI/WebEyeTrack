#!/usr/bin/env node

/**
 * Copy webeyetrack worker to public folder
 * This ensures the latest worker is always available
 *
 * Supports both:
 * - npm alias: "webeyetrack": "npm:@koyukan/webeyetrack@^1.0.1"
 * - npm link: npm link ../../ (local development)
 */

const fs = require('fs');
const path = require('path');

// Try multiple possible paths (npm alias, scoped package, or local link)
const possiblePaths = [
  path.join(__dirname, '../node_modules/webeyetrack/dist/webeyetrack.worker.js'),
  path.join(__dirname, '../node_modules/@koyukan/webeyetrack/dist/webeyetrack.worker.js'),
];

const destination = path.join(__dirname, '../public/webeyetrack.worker.js');

try {
  // Find the first existing source path
  let source = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      source = p;
      break;
    }
  }

  if (!source) {
    console.error('❌ Worker source not found. Tried:');
    possiblePaths.forEach(p => console.error('   -', p));
    console.error('   Run "npm install" first');
    process.exit(1);
  }

  // Create public directory if it doesn't exist
  const publicDir = path.dirname(destination);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(source, destination);

  console.log('✅ Copied webeyetrack.worker.js to public/');
  console.log('   Source:', source);
} catch (error) {
  console.error('❌ Failed to copy worker:', error.message);
  process.exit(1);
}
