import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../config/rtc_config.dart';

/// streamId → MediaStream 注册表。
///
/// 替代原先「WebRTCService 持有单一 remoteStream」的做法，使渲染层可按
/// streamId 订阅任意一路流，从而支持屏幕 + 摄像头并行、本地预览等场景。
class StreamRegistry {
  StreamRegistry._internal();

  static final StreamRegistry _instance = StreamRegistry._internal();

  static StreamRegistry get instance => _instance;

  final Map<String, MediaStream> _local = {};
  final Map<String, MediaStream> _remote = {};

  final Map<String, MediaSourceType> _types = {};

  final List<void Function()> _listeners = [];

  /// 已绑定的全部 streamId
  Iterable<String> get streamIds => {..._local.keys, ..._remote.keys}.toList();

  /// 已就绪的远端流 id（控制端据此渲染对应数量的 RTCVideoView）
  Iterable<String> get remoteStreamIds => _remote.keys.toList();

  /// 受控端本地预览用
  Iterable<String> get localStreamIds => _local.keys.toList();

  /// 某路流对应的源类型，未知 id 视为 [MediaSourceType.screen]
  MediaSourceType typeOf(String streamId) =>
      _types[streamId] ?? MediaSourceType.fromWireId(streamId);

  MediaStream? local(String streamId) => _local[streamId];

  MediaStream? remote(String streamId) => _remote[streamId];

  /// 渲染层取流：优先远端（控制端视角），无远端时回退本地（受控端预览）
  MediaStream? resolve(String streamId) =>
      _remote[streamId] ?? _local[streamId];

  /// 首次出现的远端流（供未指定 streamId 的旧调用点兜底）
  MediaStream? get firstRemote => _remote.isEmpty ? null : _remote.values.first;

  void addListener(void Function() listener) => _listeners.add(listener);

  void removeListener(void Function() listener) => _listeners.remove(listener);

  void bindLocal(String streamId, MediaStream stream) {
    _local[streamId] = stream;
    _types[streamId] = MediaSourceType.fromWireId(streamId);
    _notify();
  }

  void bindRemote(String streamId, MediaStream stream) {
    _remote[streamId] = stream;
    _types[streamId] = MediaSourceType.fromWireId(streamId);
    _notify();
  }

  void unbind(String streamId) {
    _local.remove(streamId);
    _remote.remove(streamId);
    _notify();
  }

  void clear() {
    if (_local.isEmpty && _remote.isEmpty) return;
    _local.clear();
    _remote.clear();
    _types.clear();
    _notify();
  }

  void _notify() {
    for (final listener in List.of(_listeners)) {
      try {
        listener();
      } catch (e) {
        debugPrint('StreamRegistry: listener error: $e');
      }
    }
  }
}
