#!/bin/bash

# 远程控制应用构建脚本

set -e

echo "========================================"
echo "  远程控制应用 - 构建脚本"
echo "========================================"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. 构建 FuickJS 框架
echo ""
echo "[1/4] 构建 FuickJS 框架..."
echo "========================================"
cd ../fuickjs_framework/fuickjs

if [ ! -d "node_modules" ]; then
    echo "安装框架依赖..."
    npm install
fi

echo "编译框架 bundle..."
node esbuild.js

# 手动编译框架字节码 (因为无法修改框架目录下的 esbuild.js)
if [ -f "/usr/local/bin/qjsc" ]; then
    echo "手动编译框架字节码..."
    /usr/local/bin/qjsc -b -o ../app/assets/js/framework.bundle.qjc ../app/assets/js/framework.bundle.js
fi

# 2. 构建 JS UI
echo ""
echo "[2/4] 构建 JS UI..."
echo "========================================"
cd "$SCRIPT_DIR/js_ui"

if [ ! -d "node_modules" ]; then
    echo "安装 JS 依赖..."
    npm install
fi

echo "编译 JS bundle..."
npm run build

# 复制 bundle 到 Flutter assets
echo "复制 bundle 到 Flutter assets..."
mkdir -p ../flutter_app/assets/js
cp dist/remote_controller.js ../flutter_app/assets/js/
cp dist/remote_controller.qjc ../flutter_app/assets/js/ 2>/dev/null || true
cp ../../fuickjs_framework/app/assets/js/framework.bundle.js ../flutter_app/assets/js/
cp ../../fuickjs_framework/app/assets/js/framework.bundle.qjc ../flutter_app/assets/js/ 2>/dev/null || true

cd ..

# 3. 获取 Flutter 依赖
echo ""
echo "[3/4] 获取 Flutter 依赖..."
echo "========================================"
cd flutter_app

flutter pub get

# 4. 构建 APK
echo ""
echo "[4/4] 构建 APK..."
echo "========================================"
flutter build apk --release

echo ""
echo "========================================"
echo "  构建完成!"
echo "========================================"
echo ""
echo "APK 位置: build/app/outputs/flutter-apk/app-release.apk"
echo ""
echo "安装命令:"
echo "  flutter install"
echo ""
