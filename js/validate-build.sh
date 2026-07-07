#!/bin/bash

set -e

echo "==================================="
echo "Build Validation Script"
echo "==================================="
echo ""

DIST_DIR="./dist"
FAILED=0

check_file() {
    local file=$1
    local description=$2

    if [ ! -f "$file" ]; then
        echo "❌ FAIL: $description not found at $file"
        FAILED=1
        return 1
    fi

    if [ ! -s "$file" ]; then
        echo "❌ FAIL: $description is empty at $file"
        FAILED=1
        return 1
    fi

    echo "✅ PASS: $description exists and has content"
    return 0
}

check_string_in_file() {
    local file=$1
    local search_string=$2
    local description=$3

    if ! grep -q "$search_string" "$file" 2>/dev/null; then
        echo "❌ FAIL: $description - '$search_string' not found in $file"
        FAILED=1
        return 1
    fi

    echo "✅ PASS: $description"
    return 0
}

echo "Checking build outputs..."
echo ""

echo "📦 ESM Build:"
check_file "$DIST_DIR/index.esm.js" "ESM bundle"
check_file "$DIST_DIR/index.esm.js.map" "ESM source map"
check_file "$DIST_DIR/index.esm.min.js" "ESM minified bundle"
check_file "$DIST_DIR/index.esm.min.js.map" "ESM minified source map"
echo ""

echo "📦 CommonJS Build:"
check_file "$DIST_DIR/index.cjs" "CJS bundle"
check_file "$DIST_DIR/index.cjs.map" "CJS source map"
echo ""

echo "📦 UMD Build:"
check_file "$DIST_DIR/index.umd.js" "UMD bundle"
check_file "$DIST_DIR/index.umd.js.map" "UMD source map"
echo ""

echo "📦 Worker Bundle:"
check_file "$DIST_DIR/webeyetrack.worker.js" "Worker bundle"
check_file "$DIST_DIR/webeyetrack.worker.js.map" "Worker source map"
echo ""

echo "📦 TypeScript Declarations:"
check_file "$DIST_DIR/index.d.ts" "Type declarations"
echo ""

echo "🔍 Validating exports..."
echo ""

echo "ESM Exports:"
check_string_in_file "$DIST_DIR/index.esm.js" "WebEyeTrack" "WebEyeTrack class exported"
check_string_in_file "$DIST_DIR/index.esm.js" "WebEyeTrackProxy" "WebEyeTrackProxy class exported"
check_string_in_file "$DIST_DIR/index.esm.js" "WebcamClient" "WebcamClient class exported"
echo ""

echo "CJS Exports:"
check_string_in_file "$DIST_DIR/index.cjs" "exports" "CommonJS exports present"
echo ""

echo "UMD Exports:"
check_string_in_file "$DIST_DIR/index.umd.js" "WebEyeTrack" "UMD WebEyeTrack global"
echo ""

echo "TypeScript Declarations:"
check_string_in_file "$DIST_DIR/index.d.ts" "WebEyeTrack" "WebEyeTrack types exported"
check_string_in_file "$DIST_DIR/index.d.ts" "IDisposable" "IDisposable types exported"
check_string_in_file "$DIST_DIR/index.d.ts" "WorkerConfig" "WorkerConfig types exported"
echo ""

echo "Worker Bundle Validation:"
check_string_in_file "$DIST_DIR/webeyetrack.worker.js" "WebEyeTrack" "Worker contains WebEyeTrack"
check_string_in_file "$DIST_DIR/webeyetrack.worker.js" "importScripts" "Worker loads MediaPipe from CDN"
echo ""

echo "==================================="
if [ $FAILED -eq 0 ]; then
    echo "✅ All validation checks passed!"
    echo "==================================="
    exit 0
else
    echo "❌ Some validation checks failed"
    echo "==================================="
    exit 1
fi
