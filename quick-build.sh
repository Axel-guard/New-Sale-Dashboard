#!/bin/bash
set -e

echo "🔨 Starting quick build..."

# Set memory limit (increased for large files)
export NODE_OPTIONS="--max-old-space-size=4096"

# Clean old build
rm -rf dist/_worker.js

# Build without minification (file too large for minifier)
npx vite build --minify false --mode production

echo "✅ Build complete!"
ls -lh dist/_worker.js
