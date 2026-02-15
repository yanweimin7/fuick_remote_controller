import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

import 'webrtc_service.dart';

class SignalingService extends BaseFuickService {
  static final SignalingService _instance = SignalingService._internal();
  factory SignalingService() => _instance;
  @override
  String get name => 'Signaling';

  MqttServerClient? _client;
  String? _deviceId;
  String? _targetDeviceId;

  // Public MQTT Broker
  // Using test.mosquitto.org for better stability
  static const String BROKER = 'test.mosquitto.org';
  static const int PORT = 1883;
  static const String TOPIC_PREFIX = 'remote_control/signal';

  SignalingService._internal() {
    registerAsyncMethod('getDeviceId', (args) async {
      _deviceId ??= (100000 + Random().nextInt(900000)).toString();
      return _deviceId;
    });

    registerAsyncMethod('connect', (args) async {
      final role = args['role']; // 'controller' or 'controlee'
      return await _connect(role);
    });

    registerAsyncMethod('disconnect', (args) async {
      _disconnect();
      return true;
    });

    registerAsyncMethod('connectToDevice', (args) async {
      final targetId = args['targetId'];
      _targetDeviceId = targetId;
      return await _startConnectionFlow(targetId);
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  Future<bool> _connect(String role) async {
    if (_deviceId == null) {
      _deviceId = (100000 + Random().nextInt(900000)).toString();
    }

    // Client ID must be unique
    final clientId = 'flutter_rc_${_deviceId}_${Random().nextInt(1000)}';
    _client = MqttServerClient(BROKER, clientId);
    _client!.port = PORT;
    _client!.logging(on: false);
    _client!.keepAlivePeriod = 60;
    _client!.autoReconnect = true;

    // Callbacks
    _client!.onConnected = () {
      // debugPrint('MQTT Connected');
      _subscribeToMyTopics();
    };
    _client!.onDisconnected = () {
      // debugPrint('MQTT Disconnected');
    };

    final connMess = MqttConnectMessage()
        .withClientIdentifier(clientId)
        .startClean() // Non persistent session for now
        .withWillQos(MqttQos.atLeastOnce);
    _client!.connectionMessage = connMess;

    try {
      await _client!.connect();
    } catch (e) {
      debugPrint('MQTT Connection failed: $e');
      _client!.disconnect();
      return false;
    }

    // Check connection status
    if (_client!.connectionStatus!.state == MqttConnectionState.connected) {
      // Listen to messages
      _client!.updates!.listen(_onMessage);
      return true;
    } else {
      _client!.disconnect();
      return false;
    }
  }

  void _subscribeToMyTopics() {
    if (_client == null || _deviceId == null) return;

    // Subscribe to messages sent to ME
    // Topics:
    // prefix/deviceId/offer
    // prefix/deviceId/answer
    // prefix/deviceId/candidate

    final myTopic = '$TOPIC_PREFIX/$_deviceId/#';
    _client!.subscribe(myTopic, MqttQos.atLeastOnce);
    // debugPrint('Subscribed to $myTopic');
  }

  void _onMessage(List<MqttReceivedMessage<MqttMessage?>>? c) {
    final recMess = c![0].payload as MqttPublishMessage;
    final pt =
        MqttPublishPayload.bytesToStringAsString(recMess.payload.message);
    // final topic = c[0].topic;

    // debugPrint('MQTT Message received on topic: $topic');
    // debugPrint('Payload: $pt');

    try {
      final data = jsonDecode(pt);
      _handleSignalingData(data);
    } catch (e) {
      debugPrint('Error parsing MQTT message: $e');
    }
  }

  Future<void> _handleSignalingData(Map<String, dynamic> data) async {
    final type = data['type'];
    final sourceId = data['sourceId'];

    // If we receive a message from ourselves, ignore it (shouldn't happen with correct topics but safety first)
    if (sourceId == _deviceId) return;

    // debugPrint('SignalingService: Received $type from $sourceId');

    if (type == 'offer') {
      // Received Offer -> Set Remote -> Create Answer -> Send Answer
      _targetDeviceId = sourceId; // Lock on to this caller

      // Notify UI
      // debugPrint('SignalingService: Emitting received_offer to UI');
      controller?.getService<NativeEventService>()?.emit(
          'signaling_state', {'state': 'received_offer', 'sourceId': sourceId});

      final webRTC = WebRTCService();

      // FIX: Initialize PeerConnection as Callee (false)
      // This is required before we can handle any signals
      // debugPrint('SignalingService: Initializing WebRTC as Callee...');
      await webRTC.startCall(false);

      // Ensure setSignalingCallback is set BEFORE calling handleSignal.
      webRTC.setSignalingCallback((signalData) {
        // debugPrint('SignalingService: Sending Answer/Candidate to $_targetDeviceId');
        _sendSignal(_targetDeviceId!, signalData['type'], signalData);
      });

      // handleSignal will: SetRemote(Offer) -> CreateAnswer -> SetLocal(Answer) -> _sendSignal(Answer)
      // debugPrint('SignalingService: Handling Offer...');
      await webRTC.handleSignal({'type': 'offer', 'sdp': data['sdp']});
    } else if (type == 'answer') {
      // Received Answer -> Set Remote
      // debugPrint('SignalingService: Handling Answer...');
      await WebRTCService()
          .handleSignal({'type': 'answer', 'sdp': data['sdp']});
    } else if (type == 'candidate') {
      // Received Candidate -> Add Candidate
      // debugPrint('SignalingService: Handling Candidate...');
      await WebRTCService()
          .handleSignal({'type': 'candidate', 'candidate': data['candidate']});
    }
  }

  Future<bool> _startConnectionFlow(String targetId) async {
    // debugPrint('SignalingService: Starting connection flow to $targetId');
    if (_client == null ||
        _client!.connectionStatus!.state != MqttConnectionState.connected) {
      // debugPrint('SignalingService: MQTT not connected, connecting now...');
      await _connect('controller');
    }

    _targetDeviceId = targetId;

    final webRTC = WebRTCService();

    // Set callback to send Offer and Candidates
    webRTC.setSignalingCallback((data) {
      // debugPrint('SignalingService: Sending ${data['type']} to $targetId');
      _sendSignal(targetId, data['type'], data);
    });

    // Initiate Call (creates Offer)
    debugPrint('SignalingService: WebRTC startCall(true)...');
    await webRTC.startCall(true); // isCaller = true

    return true;
  }

  void _sendSignal(String targetId, String type, Map<String, dynamic> data) {
    if (_client == null) return;

    final topic = '$TOPIC_PREFIX/$targetId/$type';

    // Wrap data with sourceId so receiver knows who sent it
    final payload = Map<String, dynamic>.from(data);
    payload['sourceId'] = _deviceId;

    _publish(topic, payload);
  }

  void _publish(String topic, Map<String, dynamic> message) {
    final builder = MqttClientPayloadBuilder();
    builder.addString(jsonEncode(message));
    _client!.publishMessage(topic, MqttQos.atLeastOnce, builder.payload!);
  }

  void _disconnect() {
    _client?.disconnect();
    _client = null;
  }
}
