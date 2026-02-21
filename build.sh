#!/bin/bash

# AnyLink - Build Script

set -e

echo "========================================"
echo "  AnyLink - Build Script"
echo "========================================"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Build FuickJS Framework
echo ""
echo "[1/4] Building FuickJS Framework..."
echo "========================================"
cd ../fuickjs_framework/fuickjs

if [ ! -d "node_modules" ]; then
    echo "Installing framework dependencies..."
    npm install
fi

echo "Compiling framework bundle..."
node esbuild.js

# Manually compile framework bytecode (since we can't modify esbuild.js in framework dir)
if [ -f "/usr/local/bin/qjsc" ]; then
    echo "Manually compiling framework bytecode..."
    /usr/local/bin/qjsc -b -o ../app/assets/js/framework.bundle.qjc ../app/assets/js/framework.bundle.js
fi

# 2. Build JS UI
echo ""
echo "[2/4] Building JS UI..."
echo "========================================"
cd "$SCRIPT_DIR/js_ui"

if [ ! -d "node_modules" ]; then
    echo "Installing JS dependencies..."
    npm install
fi

echo "Compiling JS bundle..."
npm run build

# Copy bundle to Flutter assets
echo "Copying bundle to Flutter assets..."
mkdir -p ../flutter_app/assets/js
cp dist/anylink_controller.js ../flutter_app/assets/js/
cp dist/anylink_controller.qjc ../flutter_app/assets/js/ 2>/dev/null || true
cp ../../fuickjs_framework/app/assets/js/framework.bundle.js ../flutter_app/assets/js/
cp ../../fuickjs_framework/app/assets/js/framework.bundle.qjc ../flutter_app/assets/js/ 2>/dev/null || true

cd ..

# 3. Get Flutter dependencies
echo ""
echo "[3/4] Getting Flutter dependencies..."
echo "========================================"
cd flutter_app

flutter pub get

# 4. Build APK
echo ""
echo "[4/4] Building APK..."
echo "========================================"
flutter build apk --release

echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo ""
echo "APK Location: build/app/outputs/flutter-apk/app-release.apk"
echo ""
echo "Install Command:"
echo "  flutter install"
echo ""
