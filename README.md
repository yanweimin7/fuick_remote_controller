# 远程控制应用

基于 **fuickjs** 框架实现的远程控制应用，支持在同一局域网内实现手机屏幕的实时传输和远程控制。

## 功能特性

### 1. 双模式支持
- **控制端**：连接并控制其他设备
- **被控端**：共享屏幕并接受远程控制

### 2. 实时屏幕传输
- 使用 Android MediaProjection API 捕获屏幕
- WebSocket 实时传输图像数据
- 支持自定义图像质量和分辨率

### 3. 远程操作
- 点击控制
- 滑动手势
- 返回/Home/最近任务按键
- 需要开启 Accessibility 服务权限

### 4. 局域网发现
- 自动发现同一 WiFi 下的设备
- 支持手动输入 IP 连接

## 项目结构

```
remote_control_app/
├── flutter_app/           # Flutter 原生应用
│   ├── lib/
│   │   ├── main.dart
│   │   ├── core/         # 核心配置
│   │   ├── screens/      # 页面
│   │   └── services/     # 原生服务
│   └── android/          # Android 原生代码
│       └── app/src/main/kotlin/
│           ├── ScreenCapturePlugin.kt
│           ├── AccessibilityControlPlugin.kt
│           └── RemoteControlAccessibilityService.kt
│
└── js_ui/                # fuickjs UI 项目
    ├── src/
    │   ├── app.ts        # 应用入口
    │   ├── pages/        # 页面组件
    │   │   ├── controller_home.tsx
    │   │   ├── controller_connect.tsx
    │   │   ├── controller_control.tsx
    │   │   └── controlee_home.tsx
    │   ├── services/     # 网络服务
    │   └── types/        # 类型定义
    └── dist/             # 编译输出
```

## 技术栈

### 前端 (UI)
- **fuickjs**：React-like 框架，用于构建跨平台 UI
- TypeScript

### 后端 (原生)
- **Flutter**：跨平台框架
- **Kotlin**：Android 原生开发
- **MediaProjection**：屏幕捕获
- **AccessibilityService**：手势注入

### 通信
- **WebSocket**：实时数据传输
- **UDP 广播**：设备发现
- **mDNS**：局域网服务发现

## 运行环境要求

- Android 7.0+ (API 24+)
- 同一 WiFi 网络
- 被控端需要开启 Accessibility 服务

## 快速开始

### 1. 克隆项目

```bash
cd /Users/wey/work/flutter_dynamic/remote_control_app
```

### 2. 编译 JS UI

```bash
cd js_ui
npm install
npm run build
```

将生成的 `dist/bundle.js` 复制到 Flutter 项目的 assets 目录。

### 3. 运行 Flutter 应用

```bash
cd flutter_app
flutter pub get
flutter run
```

## 使用说明

### 被控端（被控制的手机）

1. 打开应用，选择「被控端」模式
2. 开启「屏幕共享服务」
   - 首次使用需要授权屏幕捕获权限
   - 需要开启 Accessibility 服务才能接收点击操作
3. 服务启动后会显示设备 IP 地址和端口

### 控制端（控制的手机）

1. 打开应用，选择「控制端」模式
2. 等待自动发现设备，或手动输入被控端 IP
3. 点击连接，等待屏幕画面显示
4. 在屏幕上点击/滑动即可远程控制被控端

## 权限说明

### 必需权限

| 权限 | 用途 |
|------|------|
| `INTERNET` | 网络通信 |
| `FOREGROUND_SERVICE` | 屏幕捕获后台服务 |
| `BIND_ACCESSIBILITY_SERVICE` | 注入点击操作 |

### 首次使用设置

1. **屏幕捕获权限**：系统会弹出授权对话框
2. **Accessibility 服务**：
   - 前往 设置 > 无障碍 > 远程控制服务
   - 开启服务
   - 允许「使用服务」

## 性能优化

### 图像传输
- 默认分辨率：1280x720
- 默认帧率：30fps
- 默认质量：80%
- 可根据网络状况调整

### 延迟优化
- 使用 TCP Socket 保证传输可靠性
- 图像压缩为 JPEG 减少数据量
- 支持自适应码率

## 注意事项

1. **安全性**：当前版本仅适用于同一局域网内的可信设备
2. **电量消耗**：屏幕捕获会持续消耗电量
3. **网络流量**：高清传输会消耗较多流量
4. **兼容性**：部分应用可能阻止屏幕捕获（如银行类应用）

## 开发计划

- [ ] 密码/Token 验证
- [ ] 端到端加密
- [ ] 远程音频传输
- [ ] 文件传输功能
- [ ] iOS 支持

## 参考项目

- [scrcpy](https://github.com/Genymobile/scrcpy)：Android 屏幕镜像工具
- [fuickjs](https://github.com/your-org/fuickjs)：本项目使用的 UI 框架

## 许可证

MIT License
