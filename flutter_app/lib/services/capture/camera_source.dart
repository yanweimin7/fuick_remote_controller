import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../config/rtc_config.dart';
import 'media_source.dart';

/// 摄像头采集：getUserMedia
class CameraSource extends MediaSource {
  static final CameraSource _instance = CameraSource._internal();
  factory CameraSource() => _instance;

  CameraSource._internal();

  MediaStream? _stream;

  /// 'user' = 前置，'environment' = 后置
  String _facingMode = 'user';

  bool _torchOn = false;

  @override
  MediaSourceType get type => MediaSourceType.camera;

  String get facingMode => _facingMode;

  bool get torchOn => _torchOn;

  MediaStream? get stream => _stream;

  MediaStreamTrack? get videoTrack => _stream?.getVideoTracks().firstOrNull;

  @override
  Future<MediaStream?> start(CapturePreset preset) async {
    if (_stream != null) return _stream;

    if (!await _ensurePermission()) return null;

    final constraints = <String, dynamic>{
      'audio': false,
      'video': {
        'facingMode': _facingMode,
        // getUserMedia 的 constraints 生效，用 ideal 做软协商
        'width': {'ideal': preset.maxWidth},
        'height': {'ideal': preset.maxHeight},
        'frameRate': {'ideal': preset.maxFrameRate, 'max': preset.maxFrameRate},
      }
    };

    try {
      _stream = await navigator.mediaDevices.getUserMedia(constraints);
      return _stream;
    } catch (e) {
      debugPrint('CameraSource: getUserMedia failed: $e');
      return null;
    }
  }

  Future<bool> _ensurePermission() async {
    try {
      final status = await Permission.camera.request();
      if (status.isGranted || status.isLimited) return true;
      debugPrint('CameraSource: camera permission ${status.name}');
      return false;
    } catch (e) {
      debugPrint('CameraSource: permission request failed: $e');
      return false;
    }
  }

  /// 前后摄切换。
  ///
  /// 走原生 `MediaStreamTrack.switchCamera()`：只切换底层摄像头，track id 不变，
  /// 因此无需重协商、trackId↔streamId 映射也不受影响。
  /// 比「重新 getUserMedia 再换轨」轻量得多（后者需重建 surface 并会闪黑）。
  Future<bool> switchCamera() async {
    final track = videoTrack;
    if (track == null) return false;

    try {
      final ok = await track.switchCamera();
      if (ok) {
        _facingMode = _facingMode == 'user' ? 'environment' : 'user';
        _torchOn = false;
      }
      return ok;
    } catch (e) {
      debugPrint('CameraSource: switchCamera failed: $e');
      return false;
    }
  }

  Future<bool> setTorch(bool on) async {
    final track = videoTrack;
    if (track == null) return false;
    try {
      await track.setTorch(on);
      _torchOn = on;
      return true;
    } catch (e) {
      debugPrint('CameraSource: setTorch failed: $e');
      return false;
    }
  }

  Future<bool> hasTorch() async {
    final track = videoTrack;
    if (track == null) return false;
    try {
      return await track.hasTorch();
    } catch (e) {
      return false;
    }
  }

  Future<void> setZoom(double level) async {
    final track = videoTrack;
    if (track == null) return;
    try {
      await Helper.setZoom(track, level);
    } catch (e) {
      debugPrint('CameraSource: setZoom failed: $e');
    }
  }

  /// 运行时调整采集分辨率（编码侧缩放由 EncoderTuner 同步收敛）
  Future<void> adaptResolution(int width, int height) async {
    final track = videoTrack;
    if (track == null) return;
    try {
      await track.adaptRes(width, height);
    } catch (e) {
      debugPrint('CameraSource: adaptRes failed: $e');
    }
  }

  @override
  Future<void> stop() async {
    final stream = _stream;
    _stream = null;
    _torchOn = false;
    if (stream == null) return;
    try {
      for (final track in stream.getTracks()) {
        await track.stop();
        await track.dispose();
      }
      await stream.dispose();
    } catch (e) {
      debugPrint('CameraSource: dispose failed: $e');
    }
  }
}
