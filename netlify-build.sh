#!/bin/bash
set -e
echo "=== Netlify Build Started ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"

echo "=== Removing old dist ==="
rm -rf frontend/dist

echo "=== Installing backend dependencies (for function bundling) ==="
cd backend
npm ci --prefer-offline --no-audit --omit=dev 2>&1

echo "=== Installing frontend dependencies ==="
cd ../frontend
npm ci --prefer-offline --no-audit --omit=dev 2>&1

echo "=== Building frontend ==="
npm run build 2>&1

echo "=== Build completed successfully ==="