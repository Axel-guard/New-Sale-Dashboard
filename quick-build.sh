#!/bin/bash
set -e

echo "🔨 Starting quick build..."

# Set memory limit
export NODE_OPTIONS="--max-old-space-size=3072"

# Clean old build
rm -rf dist/_worker.js

# Build with esbuild (faster)
npx vite build --minify esbuild --mode production

echo "✅ Build complete!"
ls -lh dist/_worker.js
