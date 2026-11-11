#!/usr/bin/env bash
# build.sh — Full-stack build script for Render
# Called by Render's buildCommand (or manually).
# Builds the React frontend, then installs Python backend dependencies.

set -e

echo "=== [1/2] Building React frontend ==="
cd frontend
npm install --legacy-peer-deps
npm run build
echo "    ✅ Frontend built to frontend/dist/"

cd ..

echo "=== [2/2] Installing Python backend dependencies ==="
cd backend
pip install -r requirements.txt
echo "    ✅ Python packages installed"

echo ""
echo "✅ LandGuard build complete."

