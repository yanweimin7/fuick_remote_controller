import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:fuickjs_flutter/core/utils/extensions.dart';

import 'control_service.dart';

/// Screen Capture Service - Captures screen on the controlled device and transmits to controller
class ScreenCaptureService extends BaseFuickService {
  static final ScreenCaptureService _instance =
      ScreenCaptureService._internal();

  factory ScreenCaptureService() => _instance;

  @override
  String get name => 'ScreenCapture';

  static const MethodChannel _channel = MethodChannel('screen_capture');

  StreamSubscription? _frameSubscription;
  bool _isCapturing = false;

  // Image quality settings
  int _quality = 90;
  int _maxWidth = 1920;
  int _maxHeight = 1920; // Allow 1920 height for portrait mode
  int _frameRate = 30;

  ScreenCaptureService._internal() {
    // Start screen capture
    registerMethod('startCapture', (args) async {
      _quality = asIntOrNull(args['quality']) ?? 90;
      _maxWidth = asIntOrNull(args['maxWidth']) ?? 1920;
      _maxHeight = asIntOrNull(args['maxHeight']) ?? 1920;
      _frameRate = asIntOrNull(args['frameRate']) ?? 30;
      return await startCapture();
    });

    // Stop screen capture
    registerMethod('stopCapture', (args) async {
      return await stopCapture();
    });

    // Get capture status
    registerMethod('isCapturing', (args) => _isCapturing);

    // Update image quality
    registerMethod('setQuality', (args) {
      _quality = args['quality'] ?? 90;
      return _updateCaptureSettings();
    });

    // Update resolution
    registerMethod('setResolution', (args) {
      _maxWidth = args['maxWidth'] ?? 1920;
      _maxHeight = args['maxHeight'] ?? 1920;
      return _updateCaptureSettings();
    });

    // Update frame rate
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  static const EventChannel _eventChannel =
      EventChannel('screen_capture/frames');

  void _setupFrameListener() {
    if (_frameSubscription != null) return;

    // debugPrint('ScreenCapture: Setting up EventChannel listener');
    _frameSubscription = _eventChannel.receiveBroadcastStream().listen((data) {
      if (data is Map) {
        _onFrameData(data);
      }
    }, onError: (error) {
      debugPrint('ScreenCapture: EventChannel error: $error');
    }, onDone: () {
      // debugPrint('ScreenCapture: EventChannel closed');
      _frameSubscription = null;
    });
  }

  /// Start screen capture
  Future<bool> startCapture() async {
    // print('ScreenCapture: startCapture called');
    try {
      if (_isCapturing) {
        // print('ScreenCapture: Already capturing');
        return true;
      }

      // 1. Listen to EventChannel first to ensure no missed frames
      _setupFrameListener();

      // 2. Request screen capture permission (Android MediaProjection)
      // print('ScreenCapture: Requesting permission...');
      // Note: This may block until user grants permission
      final result = await _channel.invokeMethod('requestCapturePermission');
      // print('ScreenCapture: Permission result: $result');
      if (result != true) {
        _isCapturing = false;
        return false;
      }

      // 3. Start screen capture
      // print('ScreenCapture: Calling native startCapture...');
      await _channel.invokeMethod('startCapture', {
        'quality': _quality,
        'maxWidth': _maxWidth,
        'maxHeight': _maxHeight,
        'frameRate': _frameRate,
      });

      _isCapturing = true;
      return true;
    } catch (e) {
      print('ScreenCapture start error: $e');
      _isCapturing = false;
      return false;
    }
  }

  /// Stop screen capture
  Future<bool> stopCapture() async {
    try {
      await _frameSubscription?.cancel();
      await _channel.invokeMethod('stopCapture');
      _isCapturing = false;
      return true;
    } catch (e) {
      print('ScreenCapture stop error: $e');
      return false;
    }
  }

  DateTime? _lastFrameTime;

  /// Handle frame data received from native layer
  void _onFrameData(Map data) {
    if (!_isCapturing) return;

    // Restore original frequency limit (max 25fps)
    final now = DateTime.now();
    if (_lastFrameTime != null &&
        now.difference(_lastFrameTime!).inMilliseconds < 40) {
      return;
    }
    _lastFrameTime = now;

    // Try to get physical resolution as fallback
    int? originalWidth = data['originalWidth'];
    int? originalHeight = data['originalHeight'];

    if (originalWidth == null || originalWidth == 0) {
      try {
        final view = PlatformDispatcher.instance.views.first;
        originalWidth = view.physicalSize.width.toInt();
        originalHeight = view.physicalSize.height.toInt();
      } catch (e) {
        // ignore
      }
    }

    final bytes = data['data'] as Uint8List;

    final frameData = {
      'data': base64Encode(bytes),
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'width': data['width'],
      'height': data['height'],
      'originalWidth': originalWidth,
      'originalHeight': originalHeight,
    };

    ControlService().sendScreenFrame(frameData);
  }

  /// Update capture settings
  Future<bool> _updateCaptureSettings() async {
    try {
      await _channel.invokeMethod('updateSettings', {
        'quality': _quality,
        'maxWidth': _maxWidth,
        'maxHeight': _maxHeight,
        'frameRate': _frameRate,
      });
      return true;
    } catch (e) {
      print('Update settings error: $e');
      return false;
    }
  }
}
