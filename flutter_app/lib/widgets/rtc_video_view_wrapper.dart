import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../services/config/rtc_config.dart';
import '../services/peer/stream_registry.dart';

/// streamId → 已初始化的 [RTCVideoRenderer] 池。
///
/// fuickjs 的 `_FuickNodeWidget` 用 `ValueKey(node.id)` 作 key，而 node.id
/// 来自引擎的渲染遍历；页面一旦重渲染，视频节点就可能拿到新 id，整棵子树被
/// 销毁重建。日志表现是成对的 `[VideoView] initState` / `dispose`
/// （`didUpdateWidget` 始终为 0），RTCVideoView 的原生视图连同 texture 一起
/// 重建，间隙 Surface 为空，表现为黑屏闪烁。
///
/// 与其在 React 侧逐个消除重渲染，不如让重建变得廉价：renderer 按 streamId
/// 缓存，widget 重建后直接复用已初始化、已挂流的那个 texture，不再新建。
class _RendererEntry {
  final RTCVideoRenderer renderer = RTCVideoRenderer();
  Completer<void>? _init;

  /// 已完成 initialize()（或正在等待）
  bool ready = false;

  /// 当前挂在 renderer 上的流，跨 widget 生命周期保留
  MediaStream? stream;

  /// 当前引用该 entry 的 widget 数
  int refs = 0;

  Future<void> ensureReady() {
    if (ready) return Future.value();
    final pending = _init;
    if (pending != null) return pending.future;

    final completer = Completer<void>();
    _init = completer;
    renderer.initialize().then((_) {
      ready = true;
      if (!completer.isCompleted) completer.complete();
    }).catchError((Object e) {
      if (!completer.isCompleted) completer.completeError(e);
    });
    return completer.future;
  }
}

class RTCVideoRendererPool {
  RTCVideoRendererPool._internal();
  static final RTCVideoRendererPool _instance = RTCVideoRendererPool._internal();
  static RTCVideoRendererPool get instance => _instance;

  final Map<String, _RendererEntry> _entries = {};

  _RendererEntry _entryOf(String streamId) =>
      _entries.putIfAbsent(streamId, () => _RendererEntry());

  /// 取（并复用）某路流对应的 renderer
  Future<RTCVideoRenderer> acquire(String streamId, MediaStream? stream) async {
    final entry = _entryOf(streamId);
    entry.refs++;
    await entry.ensureReady();
    if (stream != null && entry.stream != stream) {
      entry.stream = stream;
      entry.renderer.srcObject = stream;
    }
    return entry.renderer;
  }

  /// 换流（同一 renderer 上重新挂流）
  void attach(String streamId, MediaStream? stream) {
    final entry = _entries[streamId];
    if (entry == null) return;
    if (entry.stream == stream) return;
    entry.stream = stream;
    entry.renderer.srcObject = stream;
  }

  void release(String streamId) {
    final entry = _entries[streamId];
    if (entry == null) return;
    if (--entry.refs > 0) return;
    // 该路流已无人使用，且流本身已解绑 → 真正销毁
    if (entry.stream == null) {
      _entries.remove(streamId);
      entry.renderer.dispose();
    }
  }

  /// 会话结束 / 断线时调用，释放全部 texture
  void clear() {
    if (_entries.isEmpty) return;
    for (final entry in _entries.values) {
      entry.renderer.dispose();
    }
    _entries.clear();
  }
}

class RTCVideoViewWrapper extends StatefulWidget {
  final Map<String, dynamic> props;
  const RTCVideoViewWrapper({super.key, required this.props});

  @override
  State<RTCVideoViewWrapper> createState() => _RTCVideoViewWrapperState();
}

class _RTCVideoViewWrapperState extends State<RTCVideoViewWrapper> {
  /// 未传 streamId 时回落到默认流标识
  String _streamId = MediaSourceType.screen.wireId;

  RTCVideoRenderer? _renderer;
  MediaStream? _stream;
  bool _acquiring = false;

  void Function()? _registryListener;

  @override
  void initState() {
    super.initState();
    _streamId = widget.props['streamId'] as String? ?? MediaSourceType.screen.wireId;
    _registryListener = () => _syncStream();
    StreamRegistry.instance.addListener(_registryListener!);
    _acquire();
  }

  Future<void> _acquire() async {
    if (_acquiring) return;
    _acquiring = true;
    final stream = StreamRegistry.instance.resolve(_streamId);

    RTCVideoRenderer? renderer;
    try {
      // 从池里取已初始化的 renderer；命中缓存时几乎零开销
      renderer = await RTCVideoRendererPool.instance.acquire(_streamId, stream);
    } catch (e) {
      debugPrint('[VideoView] renderer 初始化失败 id=$_streamId: $e');
    }

    if (!mounted) {
      if (renderer != null) RTCVideoRendererPool.instance.release(_streamId);
      return;
    }
    setState(() {
      _renderer = renderer;
      _stream = stream;
    });
  }

  void _syncStream() {
    final next = StreamRegistry.instance.resolve(_streamId);
    final renderer = _renderer;
    if (renderer == null) return;
    RTCVideoRendererPool.instance.attach(_streamId, next);
    if (next == _stream) return;
    if (mounted) setState(() => _stream = next);
  }

  @override
  void didUpdateWidget(covariant RTCVideoViewWrapper oldWidget) {
    super.didUpdateWidget(oldWidget);
    final nextId = widget.props['streamId'] as String?;
    if (nextId != null && nextId != _streamId) {
      RTCVideoRendererPool.instance.release(_streamId);
      _streamId = nextId;
      _renderer = null;
      _stream = null;
      _acquiring = false;
      _acquire();
    }
  }

  @override
  void dispose() {
    if (_registryListener != null) {
      StreamRegistry.instance.removeListener(_registryListener!);
    }
    // 归还引用而非立即销毁，widget 被重建时可复用同一 texture
    RTCVideoRendererPool.instance.release(_streamId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final renderer = _renderer;
    if (renderer == null || _stream == null) {
      return Container(color: Colors.transparent);
    }

    final objectFit =
        widget.props['objectFit'] == 'cover'
            ? RTCVideoViewObjectFit.RTCVideoViewObjectFitCover
            : RTCVideoViewObjectFit.RTCVideoViewObjectFitContain;

    return RTCVideoView(
      renderer,
      objectFit: objectFit,
      mirror: widget.props['mirror'] == true,
    );
  }
}
