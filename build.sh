#!/usr/bin/env bash
# LandGuard Build Script for Render
# Safe, binary-preferred dependency installation with retry logic
set -e

echo "=================================================="
echo "  LandGuard Backend Build (Render / Production)   "
echo "=================================================="

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Upgrade pip, setuptools, and wheel
echo ">>> [1/2] Upgrading packaging tools..."
python -m pip install --upgrade pip setuptools wheel

# Install dependencies using precompiled binary wheels, no cache, with retry
echo ">>> [2/2] Installing Python backend dependencies..."
if [ -f "requirements.txt" ]; then
    pip install --prefer-binary --no-cache-dir --retries 5 --timeout 60 -r requirements.txt
elif [ -f "backend/requirements.txt" ]; then
    pip install --prefer-binary --no-cache-dir --retries 5 --timeout 60 -r backend/requirements.txt
fi

echo "=================================================="
echo "  ✅ Backend build completed successfully.        "
echo "=================================================="
