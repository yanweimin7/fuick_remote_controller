/// MQTT 信令配置。
///
/// 全部字段可由构建方通过 `--dart-define` 覆盖，避免把部署参数写死在代码里：
/// ```
/// flutter build apk \
///   --dart-define=MQTT_HOST=broker.example.com \
///   --dart-define=MQTT_PORT=8883 \
///   --dart-define=MQTT_TLS=true \
///   --dart-define=MQTT_USERNAME=user \
///   --dart-define=MQTT_PASSWORD=pass
/// ```
class SignalingConfig {
  const SignalingConfig._();

  /// 默认 broker。
  ///
  /// 原值 `activemq.apache.org` 已实测不可用（DNS 可解析，TCP 1883 持续
  /// ETIMEDOUT），换为实测能完成 CONNECT + publish/subscribe 往返的
  /// Mosquitto 公共实例。
  ///
  /// ⚠️ 公共测试 broker 仅供开发：无鉴权、明文传输、限流且随时可能下线
  /// （实测 3 轮往返有 1 轮失败）。正式使用请自建 EMQX / Mosquitto 并注入：
  /// ```
  /// --dart-define=MQTT_HOST=your-broker \
  /// --dart-define=MQTT_PORT=8883 --dart-define=MQTT_TLS=true \
  /// --dart-define=MQTT_USERNAME=... --dart-define=MQTT_PASSWORD=...
  /// ```
  static const String host =
      String.fromEnvironment('MQTT_HOST', defaultValue: 'test.mosquitto.org');

  static const int port =
      int.fromEnvironment('MQTT_PORT', defaultValue: 1883);

  /// 走 TLS（1883 → 8883）。公网 broker 必须开启。
  static const bool tls = bool.fromEnvironment('MQTT_TLS');

  static const String username = String.fromEnvironment('MQTT_USERNAME');

  static const String password = String.fromEnvironment('MQTT_PASSWORD');

  static const String clientIdPrefix =
      String.fromEnvironment('MQTT_CLIENT_PREFIX', defaultValue: 'anylink');

  static const String topicPrefix = String.fromEnvironment(
    'MQTT_TOPIC_PREFIX',
    defaultValue: 'remote_control/signal',
  );

  /// 握手超时。公网 broker 需留足 TLS 协商时间。
  static const Duration connectTimeout =
      Duration(seconds: int.fromEnvironment('MQTT_TIMEOUT_SEC', defaultValue: 15));
}
