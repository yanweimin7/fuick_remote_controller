/// 采集源类型。同时作为信令与 StreamRegistry 的 streamId 契约。
///
/// 之所以显式约定字符串标识而非依赖 [MediaStream.id]：接收端拿到的远端
/// MediaStream.id 由 WebRTC 内部生成、两侧不一致，必须由信令层面统一。
enum MediaSourceType {
  screen('screen'),
  camera('camera');

  const MediaSourceType(this.wireId);

  /// 信令与渲染层使用的稳定标识
  final String wireId;

  static MediaSourceType fromWireId(String? id) {
    for (final type in MediaSourceType.values) {
      if (type.wireId == id) return type;
    }
    return MediaSourceType.screen;
  }
}

/// 采集模式契约。控制端在信令里下发，受控端据此挂载采集源。
///
/// 单一标识用逗号分隔表示多路并行，渲染层按 streamId 逐路挂载 RTCVideoView。
/// 旧版只传 `'webrtc'`，等价于屏幕共享 —— 保留解析以兼容存量控制端。
class CaptureMode {
  CaptureMode._();

  static const String screen = 'screen';
  static const String camera = 'camera';

  /// 旧值：仅屏幕
  static const String legacyWebrtc = 'webrtc';

  /// 不采集，仅数据通道
  static const String manual = 'manual';

  /// 解析为去重后的源列表，保持声明顺序（屏幕在前，画面顺序稳定）。
  /// 返回空列表表示不采集。
  static List<MediaSourceType> parse(String? captureMode) {
    if (captureMode == null || captureMode.isEmpty) return const [];

    final result = <MediaSourceType>[];
    for (final part in captureMode.split(',')) {
      final id = part.trim();
      if (id.isEmpty || id == manual) continue;

      final type = id == legacyWebrtc
          ? MediaSourceType.screen
          : MediaSourceType.fromWireId(id);

      if (!result.contains(type)) result.add(type);
    }
    return result;
  }

  /// 归一化为标准写法（供回传/日志用）
  static String? normalize(String? captureMode) {
    final sources = parse(captureMode);
    if (sources.isEmpty) return null;
    return sources.map((s) => s.wireId).join(',');
  }
}

/// 采集与编码预设。
///
/// 注意分辨率约束对不同 source 的有效性不同：
/// - camera(getUserMedia)：constraints 生效，可软协商到目标值
/// - screen(getDisplayMedia)：Android 插件侧忽略 constraints，直接用 display.getRealSize()
///   （见 flutter_webrtc GetUserMediaImpl.getDisplayMedia），因此屏幕分辨率只能靠
///   [scaleResolutionDownBy] 在编码阶段下采样
class CapturePreset {
  final int maxWidth;
  final int maxHeight;
  final int maxFrameRate;

  /// 视频编码目标码率（kbps）
  final int targetBitrateKbps;

  const CapturePreset({
    this.maxWidth = 1280,
    this.maxHeight = 720,
    this.maxFrameRate = 30,
    this.targetBitrateKbps = 2000,
  });

  static const CapturePreset screen = CapturePreset(
    maxWidth: 1280,
    maxHeight: 720,
    maxFrameRate: 30,
    targetBitrateKbps: 2500,
  );

  static const CapturePreset camera = CapturePreset(
    maxWidth: 1280,
    maxHeight: 720,
    maxFrameRate: 30,
    targetBitrateKbps: 1500,
  );

  CapturePreset copyWith({
    int? maxWidth,
    int? maxHeight,
    int? maxFrameRate,
    int? targetBitrateKbps,
  }) {
    return CapturePreset(
      maxWidth: maxWidth ?? this.maxWidth,
      maxHeight: maxHeight ?? this.maxHeight,
      maxFrameRate: maxFrameRate ?? this.maxFrameRate,
      targetBitrateKbps: targetBitrateKbps ?? this.targetBitrateKbps,
    );
  }

  /// 超过 1080p 时按整数倍下采样，抵消 Android 端忽略 constraints 的行为
  double get scaleResolutionDownBy {
    if (maxHeight > 1080) return (maxHeight / 1080).ceilToDouble();
    return 1.0;
  }
}

/// WebRTC 运行时配置
class RtcConfig {
  const RtcConfig._();

  /// 从 `--dart-define` 读取的部署期配置。
  ///
  /// 默认值面向局域网调试；跨运营商大网必须由构建方注入 TURN，
  /// 否则 peer 双方都在对称 NAT 之后将无法打洞。
  static const String turnUrl = String.fromEnvironment('TURN_URL');
  static const String turnUsername = String.fromEnvironment('TURN_USERNAME');
  static const String turnCredential = String.fromEnvironment('TURN_CREDENTIAL');

  /// 是否启用了可用的 TURN
  static bool get hasTurn => turnUrl.isNotEmpty;

  /// STUN/TURN 配置。
  ///
  /// TURN 条目仅在注入 [turnUrl] 后才加入 —— 缺少 username/credential 的
  /// TURN server 会让 libwebrtc 反复重试认证并拖慢建连，
  /// 比不配 TURN 更糟。
  static List<Map<String, dynamic>> buildIceServers() {
    final servers = <Map<String, dynamic>>[
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
    ];

    if (hasTurn) {
      servers.add({
        'urls': turnUrl,
        if (turnUsername.isNotEmpty) 'username': turnUsername,
        if (turnCredential.isNotEmpty) 'credential': turnCredential,
      });
    }
    return servers;
  }

  static final List<Map<String, dynamic>> iceServers = buildIceServers();

  /// createPeerConnection 的配置。注意 [RTCConfiguration] 在 webrtc_interface 1.5.1
  /// 中已被整体注释掉，平台侧仍按裸 Map 接收，故保留 map 形式。
  static final Map<String, dynamic> peerConnection = {
    'iceServers': iceServers,
    'sdpSemantics': 'unified-plan',
  };

  /// 只收视频、不收音频
  static const Map<String, dynamic> videoOnlyConstraints = {
    'mandatory': {
      'OfferToReceiveAudio': false,
      'OfferToReceiveVideo': true,
    },
    'optional': [],
  };

  /// DataChannel 分片大小。
  ///
  /// 12KB 为保守值：需为 JSON 包装开销与 SCTP 单帧上限留余量，
  /// 旧版按 UTF-16 码元估算长度，跨 Dart 版本不安全。
  static const int dataChannelChunkSize = 12 * 1024;
}
