#!/usr/bin/env bash
# build.sh — Full-stack build script for Render
# Builds the React frontend and installs Python dependencies.

set -e

echo "=================================================="
echo "  LandGuard Deployment Build (Render / Production) "
echo "=================================================="

# Determine repo root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Step 1: Install Python dependencies
echo ">>> [1/2] Installing Python dependencies..."
python -m pip install --upgrade pip
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
elif [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
fi
echo "    ✅ Python dependencies installed."

# Step 2: Build React frontend if Node / npm is present
echo ">>> [2/2] Building React frontend..."
if command -v npm &> /dev/null; then
    cd "$REPO_ROOT/frontend"
    npm install --legacy-peer-deps
    npm run build
    cd "$REPO_ROOT"
    echo "    ✅ React frontend built to frontend/dist/"
elif [ -d "$REPO_ROOT/frontend/dist" ]; then
    echo "    ℹ️ Node/npm not available, using existing frontend/dist/ bundle."
else
    echo "    ⚠️ Warning: Node/npm not found and frontend/dist/ missing."
fi

echo "=================================================="
echo "  ✅ LandGuard build completed successfully.     "
echo "=================================================="
