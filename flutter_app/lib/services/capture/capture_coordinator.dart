import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../config/rtc_config.dart';
import '../screen_capture_service.dart';
import 'camera_source.dart';
import 'media_source.dart';

/// 采集编排：收敛平台差异（Android 屏幕共享需先起 mediaProjection 前台服务），
/// 对上层只暴露「按类型拿到 MediaStream」。
///
/// 支持多路并行（屏幕 + 摄像头），因此按类型独立管理生命周期，
/// 启动第二路时不会停掉第一路。
class CaptureCoordinator {
  final ScreenSource _screen = ScreenSource();
  final CameraSource _camera = CameraSource();

  final Set<MediaSourceType> _active = {};

  CameraSource get camera => _camera;

  ScreenSource get screen => _screen;

  Set<MediaSourceType> get activeSources => Set.of(_active);

  Future<MediaStream?> start(MediaSourceType type) async {
    // 同类型重复启动直接复用，避免重复弹系统授权框
    if (_active.contains(type)) {
      return _streamOf(type);
    }

    if (type == MediaSourceType.screen) {
      return _startScreen();
    }
    return _startCamera();
  }

  Future<MediaStream?> _startScreen() async {
    if (Platform.isAndroid) {
      // Android 14+ 强制要求：申请 MediaProjection 授权前必须已启动
      // foregroundServiceType="mediaProjection" 的前台服务
      final ok = await ScreenCaptureService().startForegroundService();
      if (!ok) {
        debugPrint('CaptureCoordinator: mediaProjection FGS failed to start');
        return null;
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));

      // 每次采集前都要主动刷新授权。
      //
      // flutter_webrtc 的 GetUserMediaImpl 会缓存 mediaProjectionData，
      // 仅在 screenRequestPermissions() 入口才置空（该方法由
      // requestCapturePermission 触发）。若不主动刷新，第二次连接会直接
      // 复用上一次的 token —— 用户未重新确认，且 Android 14+ 会因
      // token 失效抛 IllegalStateException。
      final granted = await _requestProjectionPermission();
      if (!granted) {
        debugPrint('CaptureCoordinator: MediaProjection permission denied');
        await _stopScreenService();
        return null;
      }
    }

    final stream = await _screen.start(CapturePreset.screen);
    if (stream == null) {
      await _stopScreenService();
      return null;
    }
    _active.add(MediaSourceType.screen);
    return stream;
  }

  Future<MediaStream?> _startCamera() async {
    final stream = await _camera.start(CapturePreset.camera);
    if (stream != null) _active.add(MediaSourceType.camera);
    return stream;
  }

  MediaStream? _streamOf(MediaSourceType type) => switch (type) {
        MediaSourceType.screen => _screen.stream,
        MediaSourceType.camera => _camera.stream,
      };

  Future<bool> _requestProjectionPermission() async {
    try {
      return await Helper.requestCapturePermission();
    } catch (e) {
      debugPrint('CaptureCoordinator: requestCapturePermission failed: $e');
      return false;
    }
  }

  Future<void> stop() async {
    if (_active.contains(MediaSourceType.screen)) {
      await _screen.stop();
      await _stopScreenService();
    }
    if (_active.contains(MediaSourceType.camera)) {
      await _camera.stop();
    }
    _active.clear();
  }

  Future<void> _stopScreenService() async {
    if (!Platform.isAndroid) return;
    await ScreenCaptureService().stopForegroundService();
  }
}
