# AnyLink - Professional Remote Control Solution

AnyLink is a powerful remote control application built with the **FuickJS** framework, enabling real-time screen sharing and remote control across devices on the same local network or via cloud signaling.

## Key Features

### 1. Seamless Connectivity
- **Controller Mode**: Connect to and control remote devices with ease.
- **Host Mode**: Share your screen and allow remote assistance.
- **One-Click Connect**: Simple ID-based connection system.

### 2. High-Performance Screen Sharing
- Real-time screen capture using Android MediaProjection API.
- Optimized WebSocket data transmission for low latency.
- Adaptive image quality and resolution.

### 3. Full Remote Control
- Touch, click, and swipe gestures.
- Global navigation keys (Back, Home, Recents).
- Requires Accessibility Service permissions on the host device.

### 4. Smart Discovery
- Automatic local network device discovery.
- Cloud signaling for reliable connections.

## Project Structure

```
remote_control_app/
├── flutter_app/           # Native Flutter Container
│   ├── lib/
│   │   ├── main.dart
│   │   ├── core/         # Core Configuration
│   │   ├── screens/      # Screens
│   │   └── services/     # Native Services
│   └── android/          # Android Native Code
│       └── app/src/main/kotlin/
│           ├── ScreenCapturePlugin.kt
│           ├── AccessibilityControlPlugin.kt
│           └── RemoteControlAccessibilityService.kt
│
└── js_ui/                # FuickJS UI Project
    ├── src/
    │   ├── app.ts        # App Entry
    │   ├── pages/        # UI Pages
    │   │   ├── one_click_connect.tsx
    │   │   ├── controller_control.tsx
    │   └── services/     # Logic Services
    └── dist/             # Compiled Output
```

## Tech Stack

### Frontend (UI)
- **FuickJS**: React-like framework for cross-platform UI.
- **TypeScript**: Type-safe development.

### Native Backend
- **Flutter**: Cross-platform engine.
- **Kotlin**: Android native implementation.
- **MediaProjection**: High-speed screen capture.
- **AccessibilityService**: Precise gesture injection.

### Communication
- **WebSocket**: Real-time data stream.
- **UDP Broadcast / mDNS**: Device discovery.
- **WebRTC**: Peer-to-peer streaming (optional).

## Requirements

- Android 7.0+ (API 24+)
- Network connection (WiFi/LAN/Internet)
- Accessibility Service enabled on the host device

## Quick Start

### 1. Setup

```bash
cd /Users/wey/work/flutter_dynamic/remote_control_app
```

### 2. Build UI

```bash
cd js_ui
npm install
npm run build
```

This compiles the TypeScript UI into a bundle for the Flutter engine.

### 3. Run Application

```bash
cd flutter_app
flutter pub get
flutter run
```

## License

Copyright © 2026 AnyLink Team. All rights reserved.
