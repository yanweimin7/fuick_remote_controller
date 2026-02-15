import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:fuickjs_flutter/core/utils/extensions.dart';

import 'control_service.dart';

/// 屏幕捕获服务 - 用于被控端捕获屏幕并传输给控制端
class ScreenCaptureService extends BaseFuickService {
  static final ScreenCaptureService _instance =
      ScreenCaptureService._internal();
  factory ScreenCaptureService() => _instance;
  @override
  String get name => 'ScreenCapture';

  static const MethodChannel _channel = MethodChannel('screen_capture');

  StreamSubscription? _frameSubscription;
  bool _isCapturing = false;

  // 图像质量设置
  int _quality = 80;
  int _maxWidth = 1280;
  int _maxHeight = 720;
  int _frameRate = 30;

  ScreenCaptureService._internal() {
    // 开始屏幕捕获
    registerMethod('startCapture', (args) async {
      _quality = asIntOrNull(args['quality']) ?? 80;
      _maxWidth = asIntOrNull(args['maxWidth']) ?? 1280;
      _maxHeight = asIntOrNull(args['maxHeight']) ?? 720;
      _frameRate = asIntOrNull(args['frameRate']) ?? 30;
      return await startCapture();
    });

    // 停止屏幕捕获
    registerMethod('stopCapture', (args) async {
      return await stopCapture();
    });

    // 获取捕获状态
    registerMethod('isCapturing', (args) => _isCapturing);

    // 更新图像质量
    registerMethod('setQuality', (args) {
      _quality = args['quality'] ?? 80;
      return _updateCaptureSettings();
    });

    // 更新分辨率
    registerMethod('setResolution', (args) {
      _maxWidth = args['maxWidth'] ?? 1280;
      _maxHeight = args['maxHeight'] ?? 720;
      return _updateCaptureSettings();
    });

    // 更新帧率
    registerMethod('setFrameRate', (args) {
      _frameRate = args['frameRate'] ?? 30;
      return _updateCaptureSettings();
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  static const EventChannel _eventChannel =
      EventChannel('screen_capture/frames');

  void _setupFrameListener() {
    if (_frameSubscription != null) return;

    debugPrint('ScreenCapture: Setting up EventChannel listener');
    _frameSubscription = _eventChannel.receiveBroadcastStream().listen((data) {
      if (data is Map) {
        _onFrameData(data);
      }
    }, onError: (error) {
      debugPrint('ScreenCapture: EventChannel error: $error');
    }, onDone: () {
      debugPrint('ScreenCapture: EventChannel closed');
      _frameSubscription = null;
    });
  }

  /// 开始屏幕捕获
  Future<bool> startCapture() async {
    // print('ScreenCapture: startCapture called');
    try {
      if (_isCapturing) {
        // print('ScreenCapture: Already capturing');
        return true;
      }

      // 1. 先监听 EventChannel，确保不会错过第一帧
      _setupFrameListener();

      // 2. 请求屏幕捕获权限（Android MediaProjection）
      // print('ScreenCapture: Requesting permission...');
      // 注意：这里可能会阻塞，直到用户授权
      final result = await _channel.invokeMethod('requestCapturePermission');
      // print('ScreenCapture: Permission result: $result');
      if (result != true) {
        _isCapturing = false;
        return false;
      }

      // 3. 启动屏幕捕获
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

  /// 停止屏幕捕获
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

  /// 处理从原生层收到的帧数据
  void _onFrameData(Map data) {
    if (!_isCapturing) return;

    // 恢复原始频率限制 (最高 25fps)
    final now = DateTime.now();
    if (_lastFrameTime != null &&
        now.difference(_lastFrameTime!).inMilliseconds < 40) {
      return;
    }
    _lastFrameTime = now;

    // 尝试获取物理分辨率作为 fallback
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

  /// 更新捕获设置
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
