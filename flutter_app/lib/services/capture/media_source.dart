import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../config/rtc_config.dart';

/// 采集源抽象。屏幕共享与摄像头共享各自实现。
abstract class MediaSource {
  MediaSourceType get type;

  /// 返回采集到的流；失败返回 null（权限被拒、设备被占用等）
  Future<MediaStream?> start(CapturePreset preset);

  Future<void> stop();
}

/// 屏幕采集：getDisplayMedia
class ScreenSource extends MediaSource {
  static final ScreenSource _instance = ScreenSource._internal();
  factory ScreenSource() => _instance;

  ScreenSource._internal();

  MediaStream? _stream;

  MediaStream? get stream => _stream;

  @override
  MediaSourceType get type => MediaSourceType.screen;

  @override
  Future<MediaStream?> start(CapturePreset preset) async {
    if (_stream != null) return _stream;

    final constraints = <String, dynamic>{
      'audio': false,
      'video': {
        // 用 max 而非 min：小屏设备上 min 会要求上采样而导致 getDisplayMedia 失败
        'mandatory': {
          'maxWidth': '${preset.maxWidth}',
          'maxHeight': '${preset.maxHeight}',
          'maxFrameRate': '${preset.maxFrameRate}',
        },
        'optional': [],
      }
    };

    try {
      _stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      return _stream;
    } on Exception catch (e) {
      debugPrint('ScreenSource: getDisplayMedia failed: $e');
      // Android 上 MediaProjection token 复用会在第二次授权时抛 IllegalState，
      // 需刷新 token 后重试一次
      if (Platform.isAndroid && _isTokenStale(e)) {
        debugPrint('ScreenSource: refreshing MediaProjection token and retrying');
        try {
          await Helper.requestCapturePermission();
          _stream = await navigator.mediaDevices.getDisplayMedia(constraints);
          return _stream;
        } catch (e2) {
          debugPrint('ScreenSource: retry failed: $e2');
        }
      }
      return null;
    }
  }

  bool _isTokenStale(Exception e) {
    final msg = e.toString().toLowerCase();
    return msg.contains('illegalstate') ||
        msg.contains('projection') ||
        msg.contains('revoked');
  }

  @override
  Future<void> stop() async {
    final stream = _stream;
    _stream = null;
    if (stream == null) return;
    try {
      for (final track in stream.getTracks()) {
        await track.dispose();
      }
      await stream.dispose();
    } catch (e) {
      debugPrint('ScreenSource: dispose failed: $e');
    }
  }
}
