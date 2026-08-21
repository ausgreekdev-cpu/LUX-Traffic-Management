#!/bin/bash
set -e
echo "=== Netlify Build Started ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Working directory: $(pwd)"

echo "=== Removing old dist ==="
rm -rf frontend/dist

echo "=== Installing frontend dependencies ==="
cd frontend
npm install 2>&1

echo "=== Building frontend ==="
npm run build 2>&1

echo "=== Build completed successfully ==="