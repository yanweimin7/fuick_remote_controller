# Quick Start Guide

## Prerequisites

### Required Environment
- Flutter SDK 3.0+
- Dart SDK 3.0+
- Node.js 16+
- Android SDK (API 24+)
- Two Android phones (7.0+)

### Check Environment
```bash
# Check Flutter
flutter doctor

# Check Node.js
node --version
npm --version
```

## Project Structure

```
remote_control_app/
├── flutter_app/      # Flutter native app
├── js_ui/            # FuickJS UI code
└── build.sh          # Build script
```

## Build Steps

### Method 1: Use Build Script (Recommended)

```bash
cd /Users/wey/work/flutter_dynamic/remote_control_app
./build.sh
```

### Method 2: Manual Build

#### 1. Build JS UI

```bash
cd js_ui
npm install
npm run build

# Copy bundle to Flutter
mkdir -p ../flutter_app/assets/js
cp dist/bundle.js ../flutter_app/assets/js/
```

#### 2. Build Flutter App

```bash
cd ../flutter_app
flutter pub get
flutter build apk --release
```

## Install and Run

### Install APK

```bash
cd flutter_app
flutter install
```

Or install manually:
```bash
adb install build/app/outputs/flutter-apk/app-release.apk
```

### Run App

1. **On Controlled Phone (Controlee)**:
   - Open App
   - Select "Controlee" (if applicable) or wait on Home Screen
   - Click "Start Screen Sharing" (if applicable)
   - Grant Screen Capture permission
   - Go to Settings and enable Accessibility Service

2. **On Controlling Phone (Controller)**:
   - Open App
   - Select "Controller" (if applicable)
   - Enter Partner ID
   - Click Connect

## Debugging

### View Logs
```bash
flutter logs
```

### Hot Reload (During Development)
```bash
cd flutter_app
flutter run
```

### JS Debugging
In `js_ui` directory:
```bash
npm run watch  # Watch for file changes and auto-compile
```

## FAQ

### Q: Cannot discover device?
- Ensure both phones are on the same WiFi (for local discovery)
- Check firewall settings
- Try manual IP connection

### Q: Screen capture permission denied?
- Restart the app
- Check if other apps are using screen recording

### Q: Clicks not working?
- Ensure Accessibility Service is enabled on the controlled device
- Try restarting the service

### Q: Laggy video?
- Lower image quality (in settings)
- Lower resolution
- Lower frame rate

## Development Tips

### Add New Page

1. Create new page in `js_ui/src/pages/`
2. Register route in `js_ui/src/app.ts`
3. Rebuild JS bundle

### Add Native Functionality

1. Create service class in `flutter_app/lib/services/`
2. Extend `BaseFuickService`
3. Register service in `main.dart`
4. Call from JS layer via `dartCallNative`

### Modify Android Native Code

After modification, need to rebuild:
```bash
cd flutter_app
flutter clean
flutter build apk
```

## Project Dependencies

```
js_ui (TypeScript/React-like)
    ↓ Compiles to
flutter_app/assets/js/bundle.js
    ↓ Loaded by
flutter_app (Flutter/Dart)
    ↓ Calls Android Native API
Android Native (Kotlin)
```

## Next Steps

- [ ] Read `README.md` for more features
- [ ] Check `flutter_app/lib/services/` to understand native services
- [ ] Check `js_ui/src/pages/` to understand UI implementation
