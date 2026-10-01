import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';

import 'capture/capture_coordinator.dart';
import 'config/rtc_config.dart';
import 'control_service.dart';
import 'peer/peer_session.dart';
import 'peer/stream_registry.dart';
import 'screen_capture_service.dart';
import '../widgets/rtc_video_view_wrapper.dart';

typedef SignalingCallback = void Function(Map<String, dynamic> data);

/// WebRTC 门面。
///
/// 编排关系：采集源由 [CaptureCoordinator] 提供 → 挂到 [PeerSession] →
/// 收发流登记在 [StreamRegistry]。本类只保留对 JS / 其它 Service 的稳定接口。
class WebRTCService extends BaseFuickService {
  static final WebRTCService _instance = WebRTCService._internal();
  factory WebRTCService() => _instance;

  @override
  String get name => 'WebRTC';

  final PeerSession _session = PeerSession();
  final CaptureCoordinator _capture = CaptureCoordinator();

  List<MediaSourceType> _activeSources = const [];

  /// 对端设备 ID。被控端用它告诉用户「是哪个设备在请求/正在控制你」。
  String? _peerDeviceId;

  void setPeerDeviceId(String? id) => _peerDeviceId = id;

  final List<void Function()> _sessionEndedListeners = [];

  /// 会话异常终止时通知订阅方（目前只有 SignalingService 用来释放 _busy）。
  void addSessionEndedListener(void Function() cb) =>
      _sessionEndedListeners.add(cb);

  /// 兼容旧调用点：未指定 streamId 时取首路远端流
  MediaStream? get remoteStream => StreamRegistry.instance.firstRemote;

  bool get isDataChannelOpen => _session.isDataChannelOpen;

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  WebRTCService._internal() {
    registerAsyncMethod('startCall', (args) async {
      final isCaller = args['isCaller'] == true;
      final captureMode = args['captureMode'] as String?;
      return startCall(isCaller, captureMode: captureMode);
    });

    registerAsyncMethod('stopCall', (args) async {
      await stopCall();
      return true;
    });

    registerAsyncMethod('handleSignal', (args) async {
      await handleSignal(args['data'] as Map<String, dynamic>);
      return true;
    });

    registerAsyncMethod('sendControlData', (args) async {
      return sendControlData(args['data'] as Map<String, dynamic>);
    });

    registerAsyncMethod('switchCamera', (args) async {
      return _capture.camera.switchCamera();
    });

    registerAsyncMethod('setTorch', (args) async {
      return _capture.camera.setTorch(args['on'] == true);
    });

    registerAsyncMethod('getCameraState', (args) async {
      return {
        'facingMode': _capture.camera.facingMode,
        'torchOn': _capture.camera.torchOn,
        'hasTorch': await _capture.camera.hasTorch(),
      };
    });

    registerAsyncMethod('getStats', (args) async {
      return _session.getInboundStats();
    });

    _session.onSignal = _sendSignal;

    _session.onData = _onDataMessage;

    _session.onRemoteStream = (streamId, stream) {
      if (_session.isCaller) {
        _emitConnectedState('connected');
      }
    };

    _session.onDataChannelOpen = () {
      if (_session.isCaller) {
        _emitConnectedState('connected');
      } else {
        _emitControleeState('connected');
      }
    };

    // 被控端连接终止：撤掉 UI 标识 + 释放信令层的会话占用。
    // 少了这一步，SignalingService._busy 会一直卡在 true，
    // 之后所有 offer 都被静默丢弃，被控端再也不弹授权框。
    _session.onConnectionEnded = () {
      if (_session.isCaller) return;
      _emitControleeState('disconnected');
      for (final cb in List.of(_sessionEndedListeners)) {
        try {
          cb();
        } catch (e) {
          debugPrint('WebRTCService: sessionEnded listener error: $e');
        }
      }
    };

    // 流就绪/移除都推给 JS，控制端据此决定渲染几路画面
    StreamRegistry.instance.addListener(_emitStreamIds);
  }

  void _emitStreamIds() {
    final ids = StreamRegistry.instance.remoteStreamIds.toList();
    // 这条链路原本零日志，远端轨没到达时 JS 只会一直停在"等待画面..."，
    // 无法区分是 onTrack 没触发、还是事件没送达。先把两侧都打出来。
    debugPrint(
      '[rtc_streams] emit ids=$ids isCaller=${_session.isCaller} '
      'hasController=${controller != null}',
    );
    if (ids.isEmpty && !_session.isCaller) return;
    controller
        ?.getService<NativeEventService>()
        ?.emit('rtc_streams', {'streamIds': ids});
  }

  // ==================== 门面对外接口 ====================

  void setSignalingCallback(SignalingCallback callback) {
    _session.onSignal = callback;
  }

  void setOnRemoteStream(void Function(MediaStream) callback) {
    _session.onRemoteStream = (_, stream) => callback(stream);
  }

  void setOnDataChannelOpen(void Function() callback) {
    _session.onDataChannelOpen = callback;
  }

  Future<void> startCall(bool isCaller, {String? captureMode}) async {
    StreamRegistry.instance.clear();

    // captureMode 需在 start 之前解析：主叫端靠它决定预留几路 video transceiver。
    final sources = CaptureMode.parse(captureMode);

    if (isCaller) {
      // 主叫端不采集，SDP 里不会自动出现 video m-line。不预留的话
      // 被控端无处挂轨，协商失败。
      _session.addReceiveTransceivers(sources.length);
    }

    await _session.start(isCaller: isCaller);

    if (isCaller) return;

    // 受控端：按 captureMode 挂载一路或多路采集源。
    //
    // captureMode 语义见 [CaptureMode]：
    //   null / 'manual'     → 不采集
    //   'screen'            → 屏幕
    //   'camera'            → 摄像头
    //   'screen,camera'     → 双路并行（控制端渲染为两个 RTCVideoView）
    //   'webrtc'            → 旧值，等价于 'screen'
    if (sources.isEmpty) return;

    _activeSources = sources;

    for (final type in sources) {
      final stream = await _capture.start(type);
      if (stream == null) continue;

      await _session.addSource(
        type.wireId,
        stream,
        _presetFor(type),
      );
    }

    // 所有源都采集失败时回滚，避免留下一个无媒体的空连接
    if (StreamRegistry.instance.local(sources.first.wireId) == null) {
      await stopCall();
    }
  }

  CapturePreset _presetFor(MediaSourceType type) => switch (type) {
        MediaSourceType.screen => CapturePreset.screen,
        MediaSourceType.camera => CapturePreset.camera,
      };

  Future<void> handleSignal(Map<String, dynamic> data) =>
      _session.handleSignal(data);

  Future<bool> sendData(String data) => _session.send(data);

  Future<bool> sendControlData(Map<String, dynamic> data) =>
      _session.send(jsonEncode(data));

  Future<void> stopCall() async {
    await _capture.stop();
    await _session.close();
    StreamRegistry.instance.clear();
    // 会话结束，解绑后所有 renderer 引用归零，此时才真正释放 texture
    RTCVideoRendererPool.instance.clear();
    _activeSources = const [];
    // 被控端 UI 靠这个事件把「被控制中」标识撤掉并回到准备连接
    if (!_session.isCaller) {
      _emitControleeState('disconnected');
    }
    _peerDeviceId = null;
  }

  // ==================== 内部 ====================

  final Map<String, List<String?>> _chunkCache = {};

  /// 解析 DataChannel 文本：还原分片后交给 ControlService 分发
  void _onDataMessage(String text) {
    try {
      final decoded = jsonDecode(text);

      if (decoded is Map && decoded['_chunk'] == true) {
        final id = decoded['id'] as String;
        final index = decoded['i'] as int;
        final total = decoded['t'] as int;

        final buffer = _chunkCache.putIfAbsent(
          id,
          () => List<String?>.filled(total, null),
        );
        buffer[index] = decoded['d'] as String;

        if (buffer.every((c) => c != null)) {
          _chunkCache.remove(id);
          final full = jsonDecode(buffer.join());
          _onDecoded(Map<String, dynamic>.from(full as Map));
        }
        return;
      }

      if (decoded is Map) _onDecoded(Map<String, dynamic>.from(decoded));
    } catch (e) {
      debugPrint('WebRTCService: message parse failed: $e');
    }
  }

  void _onDecoded(Map<String, dynamic> data) {
    // trackId → streamId 映射由 PeerSession 消费，不下发给 ControlService
    if (data['type'] == 'stream_map') {
      final raw = data['map'];
      if (raw is Map) {
        _session.applyRemoteTrackIndex({
          for (final e in raw.entries) '${e.key}': '${e.value}',
        });
      }
      return;
    }

    if (_session.isCaller) {
      ControlService().processResponse(data);
    } else {
      ControlService().processCommand(data);
    }
  }

  void _sendSignal(Map<String, dynamic> data) {
    controller
        ?.getService<NativeEventService>()
        ?.emit('webrtc_local_signal', data);
  }

  void _emitConnectedState(String status) {
    controller?.getService<NativeEventService>()?.emit('connected', {
      'ip': 'P2P',
      'port': 0,
      'captureMode': _wireCaptureMode,
    });
  }

  void _emitControleeState(String status) {
    debugPrint('[ControleeState] emit status=$status peer=$_peerDeviceId '
        'isCaller=${_session.isCaller} hasController=${controller != null}');
    controller?.getService<NativeEventService>()?.emit('onClientConnected', {
      'status': status,
      'captureMode': _wireCaptureMode,
      'client': {
        'address': 'P2P',
        'port': 0,
        'name': _peerDeviceId == null
            ? 'WebRTC Controller'
            : 'WebRTC Controller ($_peerDeviceId)',
        'deviceId': _peerDeviceId,
      },
    });
  }

  /// 回传采集模式。
  ///
  /// 归一化后为空时必须显式回 'manual' 而非 null：
  /// 受控端 UI 靠这个值判断是否要走旧的 MediaProjection 截图通道，
  /// 发 null 会让它误以为无需处理，从而永远起不到截图。
  String? get _wireCaptureMode =>
      _activeSources.isEmpty
          ? CaptureMode.manual
          : _activeSources.map((s) => s.wireId).join(',');
}

/// 便捷访问器，供 JS / 渲染层按 streamId 取流
MediaStream? resolveStream(String streamId) => StreamRegistry.instance.resolve(streamId);

/// Android 屏幕共享需先拉起 mediaProjection 类型前台服务（14+ 强制要求）
Future<bool> ensureScreenForegroundService() =>
    ScreenCaptureService().startForegroundService();
