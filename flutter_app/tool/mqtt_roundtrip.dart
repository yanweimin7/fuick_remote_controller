// 按 AnyLink 的真实信令模式做 pub/sub 往返验证：
// 订阅 remote_control/signal/<id>/# → 往对方 topic publish → 确认收到。
// 公共 broker 常「能连上但不发消息」，只测 CONNECT 会漏掉这类。
//
// dart run tool/mqtt_roundtrip.dart
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

const TOPIC_PREFIX = 'remote_control/signal';

class Target {
  const Target(this.label, this.host, this.port, {this.tls = false});
  final String label;
  final String host;
  final int port;
  final bool tls;
}

const targets = <Target>[
  Target('Mosquitto 公共 1883', 'test.mosquitto.org', 1883),
  Target('Mosquitto 公共 8883 TLS', 'test.mosquitto.org', 8883, tls: true),
];

/// 建立一个已连接并订阅 [deviceId] 的客户端
Future<MqttServerClient> connectAndSubscribe(
  String host,
  int port,
  bool tls,
  String deviceId,
) async {
  final clientId = 'anylink_${DateTime.now().millisecondsSinceEpoch}_$deviceId';
  final client = MqttServerClient.withPort(host, clientId, port);
  client.secure = tls;
  client.keepAlivePeriod = 30;
  client.logging(on: false);
  client.connectionMessage = MqttConnectMessage()
      .withClientIdentifier(clientId)
      .startClean()
      .withWillQos(MqttQos.atLeastOnce);

  await client.connect().timeout(const Duration(seconds: 12));
  client.subscribe('$TOPIC_PREFIX/$deviceId/#', MqttQos.atLeastOnce);
  return client;
}

Future<bool> roundTrip(Target t) async {
  final stamp = DateTime.now().millisecondsSinceEpoch;
  final idA = 'probe_a_$stamp';
  final idB = 'probe_b_$stamp';

  MqttServerClient? a;
  MqttServerClient? b;
  try {
    a = await connectAndSubscribe(t.host, t.port, t.tls, idA);
    b = await connectAndSubscribe(t.host, t.port, t.tls, idB);

    final received = Completer<String>();
    b.updates?.listen((msgs) {
      for (final m in msgs) {
        if (m.payload is! MqttPublishMessage) continue;
        final s = MqttPublishPayload.bytesToStringAsString(
          (m.payload as MqttPublishMessage).payload.message,
        );
        if (!received.isCompleted) received.complete(s);
      }
    });

    // 模拟 offer：带 sourceId + sessionId 的信令消息
    final offer = jsonEncode({
      'type': 'offer',
      'sdp': 'v=0 fake-sdp',
      'sourceId': idA,
      'sessionId': 'session_$stamp',
      'captureMode': 'screen',
    });
    final builder = MqttClientPayloadBuilder()..addString(offer);

    final sw = Stopwatch()..start();
    a.publishMessage(
      '$TOPIC_PREFIX/$idB/offer',
      MqttQos.atLeastOnce,
      builder.payload!,
    );

    final got = await received.future.timeout(
      const Duration(seconds: 15),
      onTimeout: () => throw Exception('15s 未收到消息'),
    );
    sw.stop();

    final ok = got.contains('session_$stamp') && got.contains('fake-sdp');
    return ok;
  } catch (e) {
    stderr.writeln('    失败: ${e.toString().replaceAll('\n', ' ').substring(0, e.toString().length.clamp(0, 90))}');
    return false;
  } finally {
    for (final c in [a, b]) {
      try {
        c?.disconnect();
      } catch (_) {}
    }
  }
}

Future<void> main() async {
  print('AnyLink 信令模式往返测试 (topic: $TOPIC_PREFIX/<id>/#)\n');
  final alive = <Target>[];
  for (final t in targets) {
    final sw = Stopwatch()..start();
    final ok = await roundTrip(t);
    sw.stop();
    if (ok) alive.add(t);
    print('${ok ? "✅ 收发正常" : "❌ 收发失败"}  ${t.label.padRight(24)} '
        '${sw.elapsedMilliseconds.toString().padLeft(6)}ms');
    if (ok) print('        → 建议配置: MQTT_HOST=${t.host} MQTT_PORT=${t.port} '
        'MQTT_TLS=${t.tls}');
  }
  print('\n完全可用：${alive.isEmpty ? "(无)" : alive.map((t) => t.label).join(", ")}');
  exit(alive.isEmpty ? 1 : 0);
}
