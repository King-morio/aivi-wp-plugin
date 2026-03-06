#!/bin/bash
# Build script for AiVI Worker Lambda
# Run from infrastructure/lambda/worker directory

set -e

echo "🔧 Building AiVI Analyzer Worker Lambda..."

# Navigate to worker directory
cd "$(dirname "$0")"

# Clean previous build
rm -f worker.zip
rm -rf node_modules

# Install production dependencies only
echo "📦 Installing dependencies..."
npm ci --production

# Ensure checks definitions are bundled
SHARED_SOURCE="../shared/schemas/checks-definitions-v1.json"
SHARED_TARGET_DIR="shared/schemas"
if [ ! -f "$SHARED_SOURCE" ]; then
  echo "Missing checks definitions at $SHARED_SOURCE"
  exit 1
fi
mkdir -p "$SHARED_TARGET_DIR"
cp "$SHARED_SOURCE" "$SHARED_TARGET_DIR/"

# Ensure scoring config is bundled for server-side score computation
SCORING_SOURCE="../orchestrator/schemas/scoring-config-v1.json"
if [ ! -f "$SCORING_SOURCE" ]; then
  echo "Missing scoring config at $SCORING_SOURCE"
  exit 1
fi
cp "$SCORING_SOURCE" "$SHARED_TARGET_DIR/"

# Create zip package
echo "📁 Creating deployment package..."
zip -r worker.zip index.js package.json package-lock.json node_modules schemas prompts shared

# Report size
ZIP_SIZE=$(du -h worker.zip | cut -f1)
echo "✅ Build complete: worker.zip ($ZIP_SIZE)"

# Verify zip contents
echo "📋 Package contents:"
unzip -l worker.zip | head -20

echo ""
echo "🚀 Ready for deployment. Run:"
echo "   cd infrastructure/terraform && terraform apply"
