# 快速开始指南

## 环境准备

### 必需环境
- Flutter SDK 3.0+
- Dart SDK 3.0+
- Node.js 16+
- Android SDK (API 24+)
- 两部 Android 手机（7.0+）

### 检查环境
```bash
# 检查 Flutter
flutter doctor

# 检查 Node.js
node --version
npm --version
```

## 项目结构

```
remote_control_app/
├── flutter_app/      # Flutter 原生应用
├── js_ui/            # fuickjs UI 代码
└── build.sh          # 构建脚本
```

## 构建步骤

### 方法一：使用构建脚本（推荐）

```bash
cd /Users/wey/work/flutter_dynamic/remote_control_app
./build.sh
```

### 方法二：手动构建

#### 1. 构建 JS UI

```bash
cd js_ui
npm install
npm run build

# 复制 bundle 到 Flutter
mkdir -p ../flutter_app/assets/js
cp dist/bundle.js ../flutter_app/assets/js/
```

#### 2. 构建 Flutter 应用

```bash
cd ../flutter_app
flutter pub get
flutter build apk --release
```

## 安装和运行

### 安装 APK

```bash
cd flutter_app
flutter install
```

或者手动安装：
```bash
adb install build/app/outputs/flutter-apk/app-release.apk
```

### 运行应用

1. **在被控手机上**：
   - 打开应用
   - 选择「被控端」
   - 点击「开启屏幕共享服务」
   - 授权屏幕捕获权限
   - 前往设置开启 Accessibility 服务

2. **在控制手机上**：
   - 打开应用
   - 选择「控制端」
   - 等待发现设备或手动输入 IP
   - 点击连接

## 调试

### 查看日志
```bash
flutter logs
```

### 热重载（开发时）
```bash
cd flutter_app
flutter run
```

### JS 调试
在 `js_ui` 目录下：
```bash
npm run watch  # 监听文件变化自动编译
```

## 常见问题

### Q: 无法发现设备？
- 确保两台手机在同一 WiFi 下
- 检查防火墙设置
- 尝试手动输入 IP 连接

### Q: 屏幕捕获权限被拒绝？
- 重新启动应用
- 检查是否有其他应用正在使用屏幕录制

### Q: 点击无效？
- 确保被控端已开启 Accessibility 服务
- 重新开启服务试试

### Q: 画面卡顿？
- 降低图像质量（设置中调整）
- 降低分辨率
- 降低帧率

## 开发提示

### 添加新页面

1. 在 `js_ui/src/pages/` 创建新页面
2. 在 `js_ui/src/app.ts` 注册路由
3. 重新构建 JS bundle

### 添加原生功能

1. 在 `flutter_app/lib/services/` 创建服务类
2. 继承 `BaseFuickService`
3. 在 `main.dart` 中注册服务
4. JS 层通过 `dartCallNative` 调用

### 修改 Android 原生代码

修改后需要重新构建：
```bash
cd flutter_app
flutter clean
flutter build apk
```

## 项目依赖关系

```
js_ui (TypeScript/React-like)
    ↓ 编译为
flutter_app/assets/js/bundle.js
    ↓ 被加载
flutter_app (Flutter/Dart)
    ↓ 调用 Android 原生 API
Android Native (Kotlin)
```

## 下一步

- [ ] 阅读 `README.md` 了解更多功能
- [ ] 查看 `flutter_app/lib/services/` 了解原生服务
- [ ] 查看 `js_ui/src/pages/` 了解 UI 实现
