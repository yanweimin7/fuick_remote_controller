// 用工程实际的 mqtt_client 探测候选 broker —— 与 App 运行时同一套客户端。
// dart run tool/mqtt_probe.dart
import 'dart:async';
import 'dart:io';

import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

class Candidate {
  const Candidate(this.host, this.port, {this.tls = false, this.note = ''});
  final String host;
  final int port;
  final bool tls;
  final String note;
}

const candidates = <Candidate>[
  Candidate('activemq.apache.org', 1883, note: '当前默认'),
  Candidate('test.mosquitto.org', 1883, note: 'Mosquitto 公共'),
  Candidate('broker.emqx.io', 1883, note: 'EMQX 公共'),
  Candidate('broker.emqx.io', 8883, tls: true, note: 'EMQX 公共 TLS'),
  Candidate('mqtt.eclipseprojects.io', 1883, note: 'Eclipse'),
  Candidate('broker.hivemq.com', 1883, note: 'HiveMQ 公共'),
  Candidate('mqtt.thingy.cloud', 1883),
  Candidate('mqtt.arduino.cc', 1883, note: 'Arduino 中国'),
  Candidate('broker.3gpp.org', 1883),
  Candidate('public.mqtt.bz', 1883),
];

Future<String> probe(Candidate c) async {
  final id =
      'probe_${DateTime.now().millisecondsSinceEpoch}_${c.port}_${c.host.hashCode.abs() % 9999}';
  final client = c.tls
      ? MqttServerClient.withPort(c.host, id, c.port)
      : MqttServerClient.withPort(c.host, id, c.port);
  client.secure = c.tls;
  client.keepAlivePeriod = 20;
  client.logging(on: false);
  client.connectionMessage = MqttConnectMessage()
      .withClientIdentifier(id)
      .startClean()
      .withWillQos(MqttQos.atLeastOnce);

  final completer = Completer<String>();
  client.onConnected = () {
    if (!completer.isCompleted) completer.complete('✅ CONNECTED');
  };
  client.onDisconnected = () {
    if (!completer.isCompleted) completer.complete('❌ 被断开');
  };

  // connect() 本身失败（TCP/协议层）时也会走这里
  unawaited(client.connect().then<void>((_) {}, onError: (Object e) {
    if (!completer.isCompleted) {
      completer.complete('❌ ${e.runtimeType}: ${_short(e)}');
    }
  }));

  return completer.future.timeout(
    const Duration(seconds: 12),
    onTimeout: () => '❌ 超时(12s)',
  );
}

String _short(Object e) {
  final s = e.toString().replaceAll('\n', ' ');
  return s.length > 70 ? '${s.substring(0, 70)}…' : s;
}

Future<void> main() async {
  print('用工程 mqtt_client 探测（与 App 运行时同一客户端）\n');
  final alive = <Candidate>[];
  for (final c in candidates) {
    final sw = Stopwatch()..start();
    final why = await probe(c);
    sw.stop();
    if (why.startsWith('✅')) alive.add(c);
    print('${why.padRight(44)} ${('${c.host}:${c.port}').padRight(32)} ${'${sw.elapsedMilliseconds}ms'.padLeft(8)}  ${c.note}');
  }
  print('\n可用：${alive.isEmpty ? "(无)" : alive.map((a) => '${a.host}:${a.port}').join(', ')}');
  // mqtt_client 会留下未关闭的 socket/定时器，main 返回后事件循环仍在转，
  // 必须显式退出，否则探测跑完也不结束。
  exit(alive.isEmpty ? 1 : 0);
}
