#!/usr/bin/env bash
# LandGuard Backend Build Script for Render
# Safe, binary-preferred dependency installation with retry logic
set -e

echo "=================================================="
echo "  LandGuard Backend Build (Render / Production)   "
echo "=================================================="

# Upgrade pip, setuptools, and wheel
echo ">>> [1/2] Upgrading packaging tools..."
python -m pip install --upgrade pip setuptools wheel

# Install dependencies with pre-compiled wheels, no-cache, and retry logic
echo ">>> [2/2] Installing backend dependencies from requirements.txt..."
pip install --prefer-binary --no-cache-dir --retries 5 --timeout 60 -r requirements.txt

echo "=================================================="
echo "  ✅ Backend build completed successfully.        "
echo "=================================================="

