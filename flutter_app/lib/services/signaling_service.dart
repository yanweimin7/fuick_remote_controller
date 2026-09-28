import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

import 'config/signaling_config.dart';
import 'webrtc_service.dart';

class SignalingService extends BaseFuickService {
  static final SignalingService _instance = SignalingService._internal();
  factory SignalingService() => _instance;

  @override
  String get name => 'Signaling';

  MqttServerClient? _client;
  String? _deviceId;
  String? _targetDeviceId;

  /// 当前会话标识。由主叫生成，随每条信令消息下发。
  ///
  /// 作用：broker 是公共 topic，任何人都能往 `.../<deviceId>/offer` 发消息。
  /// 仅靠 sourceId 去重不足以防止上一轮会话的残留 answer/candidate 被打到
  /// 新的 PeerConnection 上（表现为建连后立刻失败，或 ICE 用了过期 ufrag）。
  String? _sessionId;

  /// 已有活跃会话时拒绝新的接入请求，避免同 id 撞车导致两路会话互相踩踏。
  bool _busy = false;

  SignalingService._internal() {
    registerAsyncMethod('getDeviceId', (args) async {
      _deviceId ??= _generateDeviceId();
      return _deviceId;
    });

    registerAsyncMethod('connect', (args) async {
      final role = args['role']; // 'controller' or 'controlee'
      return await _connect(role);
    });

    registerAsyncMethod('disconnect', (args) async {
      await _disconnect();
      return true;
    });

    registerAsyncMethod('connectToDevice', (args) async {
      final targetId = args['targetId'];
      final captureMode = args['captureMode'];
      _targetDeviceId = targetId;
      return await _startConnectionFlow(targetId, captureMode: captureMode);
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  String _generateDeviceId() =>
      (100000 + Random().nextInt(900000)).toString();

  String _newSessionId() {
    final rand = Random();
    final suffix = List.generate(
      6,
      (_) => rand.nextInt(36).toRadixString(36),
    ).join();
    return '${DateTime.now().millisecondsSinceEpoch}_$suffix';
  }

  Future<bool> _connect(String role) async {
    if (_deviceId == null) {
      _deviceId = _generateDeviceId();
    }

    final clientId = '${SignalingConfig.clientIdPrefix}_${_deviceId}_${Random().nextInt(1000)}';
    final client = MqttServerClient.withPort(
      SignalingConfig.host,
      clientId,
      SignalingConfig.port,
    );
    client.logging(on: false);
    client.keepAlivePeriod = 60;
    client.autoReconnect = true;
    client.secure = SignalingConfig.tls;

    client.onConnected = _subscribeToMyTopics;
    client.onDisconnected = () {
      if (_busy) {
        // 连接断开后立刻释放占用，否则重连后本机将永远拒绝接入
        debugPrint('SignalingService: broker dropped while in session');
        _resetSession();
      }
    };

    final connMess = MqttConnectMessage()
        .withClientIdentifier(clientId)
        .startClean()
        .withWillQos(MqttQos.atLeastOnce);
    client.connectionMessage = connMess;

    // 与用户名/密码无关：匿名连接同样需要断线重连后恢复订阅。
    // 之前放在 username.isNotEmpty 里，匿名场景下重连后不再订阅，
    // 表现为"连接状态正常但永远收不到 offer"。
    client.resubscribeOnAutoReconnect = true;

    // _client 必须在 connect() 之前赋值：onConnected 在 connect() 内就会触发，
    // 而 _subscribeToMyTopics 是从 _client 取 client 的。晚一步赋值会让
    // 回调里拿到 null 直接 return —— 连接建立成功但从未订阅。
    _client = client;

    try {
      await client.connect(
        SignalingConfig.username.isEmpty
            ? null
            : SignalingConfig.username,
        SignalingConfig.password,
      );
    } catch (e) {
      debugPrint('MQTT Connection failed: $e');
      _dropClient(client);
      return false;
    }

    if (client.connectionStatus?.state != MqttConnectionState.connected) {
      _dropClient(client);
      return false;
    }

    // 监听器必须在 connect() 之后挂。
    //
    // client.updates 是可空 getter，内部是 subscriptionsManager?.subscriptionNotifier
    // （mqtt_client 10.11.9 mqtt_client.dart:330），而 subscriptionsManager
    // 是在 connect() 内部才创建的（同文件 :368）。connect() 之前访问 updates
    // 得到 null，`?.listen` 直接短路 —— 监听器从未挂上，连接与订阅都成功，
    // 却永远收不到任何消息，表现为对方发 offer 而本端毫无反应。
    final updates = client.updates;
    if (updates == null) {
      debugPrint('SignalingService: updates 为 null，收包监听无法挂载');
      return true;
    }
    updates.listen(_onMessage, onError: (Object e) {
      debugPrint('SignalingService: updates 流异常: $e');
    });
    debugPrint('SignalingService: 收包监听已挂载');

    // onConnected 在 connect() 内部就已触发订阅，理论上对端的 offer 可能在
    // 监听器挂上之前就投递。MQTT 的 subscribe 幂等，这里补一次以消除该窗口。
    _subscribeToMyTopics();

    return true;
  }

  /// 仅当 _client 仍是该实例时才清空，避免误清掉并发建立的新连接
  void _dropClient(MqttServerClient client) {
    if (identical(_client, client)) _client = null;
    client.disconnect();
  }

  void _subscribeToMyTopics() {
    final client = _client;
    final deviceId = _deviceId;
    if (client == null || deviceId == null) return;

    // 只订阅发往本机 id 的三类信令消息
    final topic = '${SignalingConfig.topicPrefix}/$deviceId/#';
    debugPrint('SignalingService: 正在订阅 $topic (id=$deviceId)');
    client.subscribe(topic, MqttQos.atLeastOnce);
  }

  void _onMessage(List<MqttReceivedMessage<MqttMessage?>>? c) {
    if (c == null || c.isEmpty) return;

    // updates 推来的是一批消息，必须逐条处理。原先只取 c.first，
    // 一次连接会产生数十个 candidate，offer 完全可能被挤在批次里丢掉。
    for (final msg in c) {
      _handleOneMessage(msg);
    }
  }

  void _handleOneMessage(MqttReceivedMessage<MqttMessage?> msg) {
    try {
      // 强转必须在 try 内：一旦抛错会逃出 _onMessage，而 listen 未挂
      // onError 时异常会被静默吞掉，表现为"broker 收到了但 app 没反应"。
      final recMess = msg.payload as MqttPublishMessage;
      final payload =
          MqttPublishPayload.bytesToStringAsString(recMess.payload.message);

      final decoded = jsonDecode(payload);
      if (decoded is! Map) return;

      final data = Map<String, dynamic>.from(decoded);
      // 收包完全不可见时，无法区分"没订阅上"和"收到了但被会话校验丢弃"
      debugPrint('SignalingService: 收到 ${data['type']} '
          'from=${data['sourceId']} session=${data['sessionId']} '
          '本地id=$_deviceId busy=$_busy');
      unawaited(_handleSignalingData(data));
    } catch (e) {
      debugPrint('SignalingService: 处理消息失败: $e');
    }
  }

  Future<void> _handleSignalingData(Map<String, dynamic> data) async {
    final type = data['type'];
    final sourceId = data['sourceId'];

    if (sourceId == null || sourceId == _deviceId) return;

    // 会话匹配：已有会话时只接受本会话消息，新 offer 则开新会话。
    // 这样既能挡掉上一轮残留消息，又允许对方重试发起连接。
    final incomingSession = data['sessionId'] as String?;
    if (_busy && incomingSession != _sessionId) {
      // 静默 return 会让 offer 无声消失，被控端一直停在"准备连接"
      debugPrint('SignalingService: 丢弃 $type，busy=true '
          '本地 session=$_sessionId 远端 session=$incomingSession');
      return;
    }

    if (type == 'offer') {
      await _acceptOffer(data, sourceId, incomingSession);
    } else if (_sessionId != null && incomingSession != _sessionId) {
      return;
    } else if (type == 'answer') {
      await WebRTCService()
          .handleSignal({'type': 'answer', 'sdp': data['sdp']});
    } else if (type == 'candidate') {
      await WebRTCService().handleSignal(
        {'type': 'candidate', 'candidate': data['candidate']},
      );
    }
  }

  Future<void> _acceptOffer(
    Map<String, dynamic> data,
    String sourceId,
    String? sessionId,
  ) async {
    if (_busy) {
      debugPrint('SignalingService: busy, rejecting offer from $sourceId');
      return;
    }

    _busy = true;
    _targetDeviceId = sourceId;
    // 采用主叫的 sessionId，后续 answer/candidate 才能被它接受
    _sessionId = sessionId ?? _newSessionId();

    controller?.getService<NativeEventService>()?.emit('signaling_state', {
      'state': 'received_offer',
      'sourceId': sourceId,
    });

    final webRTC = WebRTCService();
    webRTC.setSignalingCallback((signalData) {
      _sendSignal(_targetDeviceId!, signalData['type'], signalData);
    });

    try {
      await webRTC.startCall(
        false,
        captureMode: data['captureMode'] as String?,
      );
      await webRTC.handleSignal({'type': 'offer', 'sdp': data['sdp']});
    } catch (e) {
      debugPrint('SignalingService: failed to accept offer: $e');
      _resetSession();
    }
  }

  Future<bool> _startConnectionFlow(
    String targetId, {
    String? captureMode,
  }) async {
    final client = _client;
    if (client == null ||
        client.connectionStatus?.state != MqttConnectionState.connected) {
      if (!await _connect('controller')) return false;
    }

    _targetDeviceId = targetId;
    _busy = true;
    _sessionId = _newSessionId();

    final webRTC = WebRTCService();
    webRTC.setSignalingCallback((signal) {
      // captureMode 随 offer 一次性下发，之后无需重复携带
      if (signal['type'] == 'offer' && captureMode != null) {
        signal['captureMode'] = captureMode;
      }
      _sendSignal(targetId, signal['type'], signal);
    });

    try {
      await webRTC.startCall(true, captureMode: captureMode);
    } catch (e) {
      debugPrint('SignalingService: failed to start call: $e');
      _resetSession();
      return false;
    }
    return true;
  }

  void _sendSignal(String targetId, String type, Map<String, dynamic> data) {
    final client = _client;
    if (client == null) {
      // 之前是静默 return，表现为"ID 能显示但怎么连都没反应"
      debugPrint('SignalingService: _sendSignal($type) 丢弃，_client 为空');
      return;
    }

    final payload = Map<String, dynamic>.from(data)
      ..['sourceId'] = _deviceId
      // sessionId 保证对端能把残留消息与本轮会话区分开
      ..['sessionId'] = _sessionId;

    final builder = MqttClientPayloadBuilder();
    builder.addString(jsonEncode(payload));
    client.publishMessage(
      '${SignalingConfig.topicPrefix}/$targetId/$type',
      MqttQos.atLeastOnce,
      builder.payload!,
    );
  }

  void _resetSession() {
    _busy = false;
    _sessionId = null;
    _targetDeviceId = null;
  }

  Future<void> _disconnect() async {
    final client = _client;
    _resetSession();
    client?.disconnect();
    _client = null;
  }
}
