import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../config/rtc_config.dart';
import 'encoder_tuner.dart';
import 'stream_registry.dart';

typedef SignalingCallback = void Function(Map<String, dynamic> data);

/// 单个 PeerConnection 会话。
///
/// 负责 PC 生命周期、DataChannel、ICE 候选排队、track 收发；
/// 上层 [WebRTCService] 只做门面编排，采集源由 capture/ 下的实现注入。
class PeerSession {
  RTCPeerConnection? _pc;
  RTCDataChannel? _dataChannel;
  bool _isCaller = false;

  /// 在 setRemoteDescription 之前抵达的候选
  final List<RTCIceCandidate> _candidateQueue = [];

  /// streamId → sender，用于后续调参
  final Map<String, RTCRtpSender> _senders = {};

  /// streamId → 本地 trackId。
  ///
  /// WebRTC 生成的 MediaStream.id 两侧不一致，但 SDP 的 msid 会把发送端 track id
  /// 带给接收端，故用 trackId 作为跨端映射键。
  final Map<String, String> _localTrackIndex = {};

  /// 远端 trackId → streamId，由对端的 stream_map 消息填充
  final Map<String, String> _remoteTrackIndex = {};

  SignalingCallback? _onSignal;
  void Function(String streamId, MediaStream stream)? _onRemoteStream;
  void Function()? _onDataChannelOpen;

  /// 连接终止（ICE disconnected/failed/closed）时回调，由上层释放会话占用。
  void Function()? _onConnectionEnded;

  /// 主叫端在生成 offer 前要预留的 recvonly video 路数，见 [addReceiveTransceivers]。
  int _receiveTransceiverCount = 0;

  RTCPeerConnection? get pc => _pc;

  bool get isCaller => _isCaller;

  bool get isDataChannelOpen =>
      _dataChannel != null &&
      _dataChannel!.state == RTCDataChannelState.RTCDataChannelOpen;

  set onSignal(SignalingCallback? cb) => _onSignal = cb;

  set onRemoteStream(void Function(String, MediaStream)? cb) =>
      _onRemoteStream = cb;

  set onDataChannelOpen(void Function()? cb) => _onDataChannelOpen = cb;

  set onConnectionEnded(void Function()? cb) => _onConnectionEnded = cb;

  /// 建立 PC 并按需发起 offer。
  ///
  /// [isCaller] 为 true 时立即创建 DataChannel 并产出 offer；为 false 时等待
  /// 远端 offer、并监听 onDataChannel。
  Future<void> start({required bool isCaller}) async {
    await close();

    _isCaller = isCaller;
    _pc = await createPeerConnection(
      RtcConfig.peerConnection,
      RtcConfig.videoOnlyConstraints,
    );

    _wireCallbacks();
  }

  void _wireCallbacks() {
    final pc = _pc;
    if (pc == null) return;

    pc.onIceCandidate = (candidate) {
      _onSignal?.call({
        'type': 'candidate',
        'candidate': {
          'candidate': candidate.candidate,
          'sdpMid': candidate.sdpMid,
          'sdpMLineIndex': candidate.sdpMLineIndex,
        }
      });
    };

    pc.onIceConnectionState = (state) {
      debugPrint('PeerSession: ICE state: $state');
      // 连接终止必须向上抛。之前这里只打日志，导致 SignalingService._busy
      // 在会话死掉后永远是 true，之后所有 offer 都被静默丢弃，
      // 被控端表现为"怎么都没反应"、也不会再弹授权框。
      if (state == RTCIceConnectionState.RTCIceConnectionStateDisconnected ||
          state == RTCIceConnectionState.RTCIceConnectionStateFailed ||
          state == RTCIceConnectionState.RTCIceConnectionStateClosed) {
        _onConnectionEnded?.call();
      }
    };

    pc.onConnectionState = (_) {};

    pc.onTrack = (event) {
      debugPrint(
        '[onTrack] track=${event.track.id} kind=${event.track.kind} '
        'streams=${event.streams.length}',
      );
      if (event.streams.isEmpty) {
        debugPrint('[onTrack] no stream attached to this track → 忽略');
        return;
      }
      final stream = event.streams.first;

      // 优先用对端上报的 trackId 映射；map 未到达时先按默认 id 占位，
      // 待 stream_map 到达后由 _applyRemoteTrackIndex 纠正
      final resolved = _remoteTrackIndex[event.track.id] ??
          MediaSourceType.screen.wireId;

      final trackId = event.track.id;
      StreamRegistry.instance.bindRemote(resolved, stream);
      if (trackId != null) _streamsByTrackId[trackId] = stream;
      _onRemoteStream?.call(resolved, stream);
    };

    if (_isCaller) {
      unawaited(_createOffer());
    } else {
      pc.onDataChannel = (channel) {
        _dataChannel = channel;
        _setupDataChannel(channel);
      };
    }
  }

  Future<void> _createOffer() async {
    final pc = _pc;
    if (pc == null) {
      debugPrint('[offer] aborted: pc 为空');
      return;
    }

    // 之前这里是 unawaited 且无 try/catch：任一步抛异常都被静默吞掉，
    // 而 startCall 早已 return true，JS 照常跳转，表现就是永远"等待画面"。
    try {
      // 必须在 createOffer 之前预留：m-line 一旦写进 offer 就固定了，
      // 之后再 addTransceiver 已经来不及。
      for (var i = 0; i < _receiveTransceiverCount; i++) {
        await pc.addTransceiver(
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          init: RTCRtpTransceiverInit(
            direction: TransceiverDirection.RecvOnly,
          ),
        );
      }
      debugPrint('PeerSession: 已预留 ${_receiveTransceiverCount} 路 recvonly video');

      final init = RTCDataChannelInit()..ordered = true;
      _dataChannel = await pc.createDataChannel('control', init);
      _setupDataChannel(_dataChannel!);
      debugPrint('[offer] dataChannel 已建，开始 createOffer');

      final offer = await pc.createOffer(RtcConfig.videoOnlyConstraints);
      await pc.setLocalDescription(offer);
      debugPrint('[offer] 已生成 sdp，交 onSignal 发出 '
          'onSignal=${_onSignal != null}');
      _onSignal?.call({'type': 'offer', 'sdp': offer.sdp});
    } catch (e, st) {
      debugPrint('[offer] 生成失败: $e\n$st');
    }
  }

  /// 主叫端在发 offer 前，按计划接收的源数量预留 recvonly video transceiver。
  ///
  /// 主叫端不采集，只通过数据通道控制，因此它的 SDP 里不会自行出现 video
  /// m-line。SDP 的 m-line 必须由 offer/answer 双方逐条对齐，若主叫不预留，
  /// 被控端 [addSource] 挂轨时无处安放，协商直接失败 —— 表现为双方都建不起
  /// 连接、对端没有任何日志。
  ///
  /// 注意：[RtcConfig.videoOnlyConstraints] 里的 `OfferToReceiveVideo` 是旧版
  /// JSEP 写法，flutter_webrtc 不解析，"愿意接收"只能靠 transceiver 表达。
  void addReceiveTransceivers(int count) {
    _receiveTransceiverCount = count;
    debugPrint('PeerSession: 计划预留 $count 路 recvonly video');
  }

  /// 挂载一路本地流，并按源类型调优编码参数。
  ///
  /// [streamId] 必须与对端约定一致（见 [MediaSourceType.wireId]）。
  Future<void> addSource(
    String streamId,
    MediaStream stream,
    CapturePreset preset,
  ) async {
    final pc = _pc;
    if (pc == null) {
      throw StateError('PeerSession not started');
    }

    StreamRegistry.instance.bindLocal(streamId, stream);

    for (final track in stream.getTracks()) {
      final sender = await pc.addTrack(track, stream);
      _senders[streamId] = sender;
      final trackId = track.id;
      if (trackId != null) _localTrackIndex[streamId] = trackId;

      switch (MediaSourceType.fromWireId(streamId)) {
        case MediaSourceType.screen:
          await EncoderTuner.tuneScreen(sender, preset);
        case MediaSourceType.camera:
          await EncoderTuner.tuneCamera(sender, preset);
      }
    }
  }

  /// 运行时调整已挂载流的编码参数（如分辨率档位变化）
  Future<void> retune(String streamId, CapturePreset preset) async {
    final sender = _senders[streamId];
    if (sender == null) return;

    switch (MediaSourceType.fromWireId(streamId)) {
      case MediaSourceType.screen:
        await EncoderTuner.tuneScreen(sender, preset);
      case MediaSourceType.camera:
        await EncoderTuner.tuneCamera(sender, preset);
    }
  }

  void removeSender(String streamId) => _senders.remove(streamId);

  /// 处理远端信令：offer / answer / candidate
  Future<void> handleSignal(Map<String, dynamic> data) async {
    final type = data['type'];

    if (_pc == null) {
      if (type == 'candidate') {
        debugPrint('PeerSession: buffering candidate (PC not ready)');
        _candidateQueue.add(_parseCandidate(data['candidate']));
      } else {
        debugPrint('PeerSession: dropping signal $type (PC is null)');
      }
      return;
    }

    if (type == 'offer') {
      await _pc!.setRemoteDescription(RTCSessionDescription(data['sdp'], 'offer'));
      await _flushCandidates();

      final answer = await _pc!.createAnswer(RtcConfig.videoOnlyConstraints);
      await _pc!.setLocalDescription(answer);
      _onSignal?.call({'type': 'answer', 'sdp': answer.sdp});
    } else if (type == 'answer') {
      await _pc!.setRemoteDescription(RTCSessionDescription(data['sdp'], 'answer'));
      await _flushCandidates();
    } else if (type == 'candidate') {
      final candidate = _parseCandidate(data['candidate']);
      if (await _pc!.getRemoteDescription() != null) {
        try {
          await _pc!.addCandidate(candidate);
        } catch (e) {
          debugPrint('PeerSession: addCandidate failed: $e');
        }
      } else {
        _candidateQueue.add(candidate);
      }
    }
  }

  RTCIceCandidate _parseCandidate(dynamic raw) {
    final map = raw as Map<dynamic, dynamic>;
    return RTCIceCandidate(
      map['candidate'] as String?,
      map['sdpMid'] as String?,
      map['sdpMLineIndex'] as int?,
    );
  }

  Future<void> _flushCandidates() async {
    if (_candidateQueue.isEmpty) return;
    debugPrint('PeerSession: flushing ${_candidateQueue.length} candidates');
    for (final candidate in _candidateQueue) {
      try {
        await _pc?.addCandidate(candidate);
      } catch (e) {
        debugPrint('PeerSession: queued candidate failed: $e');
      }
    }
    _candidateQueue.clear();
  }

  // ==================== DataChannel ====================

  void _setupDataChannel(RTCDataChannel channel) {
    channel.onDataChannelState = (state) {
      debugPrint('PeerSession: data channel state: $state '
          'isOpen=${state == RTCDataChannelState.RTCDataChannelOpen} '
          'hasCb=${_onDataChannelOpen != null}');
      if (state == RTCDataChannelState.RTCDataChannelOpen) {
        // 受控端把自己的 trackId 映射上报给控制端
        if (!_isCaller && _localTrackIndex.isNotEmpty) {
          unawaited(send(jsonEncode({
            'type': 'stream_map',
            'map': _localTrackIndex,
          })));
        }
        _onDataChannelOpen?.call();
      }
    };

    channel.onMessage = (RTCDataChannelMessage message) {
      if (message.isBinary) return;
      onData?.call(message.text);
    };
  }

  /// 收到对端的 trackId → streamId 映射。
  ///
  /// onTrack 可能早于该消息到达（此时流已按默认 id 登记），
  /// 此处按映射关系重新登记以纠正 streamId。
  void applyRemoteTrackIndex(Map<String, String> mapping) {
    _remoteTrackIndex.addAll(mapping);

    // 映射由受控端(被叫)发出，只有控制端(主叫)会收到。
    // 但仍需按 _streamsByTrackId 实有内容兜底重绑，
    // 以防同一实例被复用为主叫的极端情况。
    for (final entry in mapping.entries) {
      final stream = _streamsByTrackId[entry.key];
      if (stream == null) continue;
      StreamRegistry.instance.bindRemote(entry.value, stream);
      _onRemoteStream?.call(entry.value, stream);
    }
  }

  /// trackId → 已登记的远端流，供映射纠正时反查
  final Map<String, MediaStream> _streamsByTrackId = {};

  /// 收到 DataChannel 文本消息时回调（由 WebRTCService 注入以复用分片重组逻辑）
  void Function(String text)? onData;

  /// 发送文本，>12KB 自动分片
  Future<bool> send(String data) async {
    if (!isDataChannelOpen) return false;

    const chunkSize = RtcConfig.dataChannelChunkSize;
    if (data.length <= chunkSize) {
      try {
        await _dataChannel!.send(RTCDataChannelMessage(data));
        return true;
      } catch (e) {
        debugPrint('PeerSession: send failed: $e');
        return false;
      }
    }

    final msgId = '${DateTime.now().microsecondsSinceEpoch}_${data.length}';
    final totalChunks = (data.length / chunkSize).ceil();

    try {
      for (var i = 0; i < totalChunks; i++) {
        final start = i * chunkSize;
        final end =
            (start + chunkSize < data.length) ? start + chunkSize : data.length;

        await _dataChannel!.send(RTCDataChannelMessage(jsonEncode({
          '_chunk': true,
          'id': msgId,
          'i': i,
          't': totalChunks,
          'd': data.substring(start, end),
        })));
      }
      return true;
    } catch (e) {
      debugPrint('PeerSession: chunked send failed: $e');
      return false;
    }
  }

  /// 接收端码流统计：streamId → {width, height, fps, bitrateKbps}
  ///
  /// 供 UI 展示实时分辨率/帧率/码率，替代 JS 侧基于截图时间的 FPS 估算
  /// （WebRTC 模式下不再有 screen_frame，该估算本就失效）。
  Future<Map<String, dynamic>> getInboundStats() async {
    final result = <String, dynamic>{};
    final pc = _pc;
    if (pc == null) return result;

    final List<RTCRtpReceiver> receivers;
    try {
      receivers = await pc.getReceivers();
    } catch (e) {
      debugPrint('PeerSession: getReceivers failed: $e');
      return result;
    }

    for (final receiver in receivers) {
      final trackId = receiver.track?.id;
      if (trackId == null) continue;
      final streamId = _remoteTrackIndex[trackId] ?? MediaSourceType.screen.wireId;

      try {
        final reports = await receiver.getStats();
        for (final report in reports) {
          if (report.type != 'inbound-rtp') continue;

          final frames = _asDouble(report.values['framesPerSecond']);
          final bytes = _asDouble(report.values['bytesReceived']);
          final width = _asDouble(report.values['frameWidth'])?.toInt();
          final height = _asDouble(report.values['frameHeight'])?.toInt();

          result[streamId] = {
            'width': width,
            'height': height,
            'fps': frames?.round(),
            'bytesReceived': bytes?.round(),
            'packetsLost': report.values['packetsLost'],
          };
        }
      } catch (e) {
        debugPrint('PeerSession: getStats failed for $streamId: $e');
      }
    }
    return result;
  }

  double? _asDouble(dynamic value) => switch (value) {
        num n => n.toDouble(),
        String s => double.tryParse(s),
        _ => null,
      };

  Future<void> close() async {
    try {
      await _dataChannel?.close();
      _dataChannel = null;
    } catch (e) {
      debugPrint('PeerSession: close dataChannel failed: $e');
    }

    try {
      await _pc?.close();
    } catch (e) {
      debugPrint('PeerSession: close pc failed: $e');
    }

    _pc = null;
    _senders.clear();
    _candidateQueue.clear();
    _localTrackIndex.clear();
    _remoteTrackIndex.clear();
    _streamsByTrackId.clear();
  }
}
