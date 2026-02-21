import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:fuickjs_flutter/core/utils/extensions.dart';
import 'webrtc_service.dart';

/// Control Service - Handles control commands and click events
class ControlService extends BaseFuickService {
  static final ControlService _instance = ControlService._internal();
  factory ControlService() => _instance;
  @override
  String get name => 'Control';

  static const MethodChannel _channel = MethodChannel('accessibility_control');

  ControlService._internal() {
    // Disconnect
    registerAsyncMethod('disconnect', (args) async {
      return await disconnect();
    });

    // Send click event (Called by controller)
    registerAsyncMethod('sendClick', (args) async {
      final x = args['x'];
      final y = args['y'];
      return await sendClick(x, y);
    });

    // Send swipe event (Called by controller)
    registerAsyncMethod('sendSwipe', (args) async {
      final startX = args['startX'];
      final startY = args['startY'];
      final endX = args['endX'];
      final endY = args['endY'];
      final duration = asIntOrNull(args['duration']) ?? 300;
      return await sendSwipe(startX, startY, endX, endY, duration);
    });

    // Send long press event (Called by controller)
    registerAsyncMethod('sendLongPress', (args) async {
      final x = args['x'];
      final y = args['y'];
      final duration = args['duration'] ?? 1000;
      return await sendLongPress(x, y, duration);
    });

    // Send Back key
    registerAsyncMethod('sendBack', (args) async {
      return await sendKey('back');
    });

    // Send Home key
    registerAsyncMethod('sendHome', (args) async {
      return await sendKey('home');
    });

    // Send Recent Apps key
    registerAsyncMethod('sendRecent', (args) async {
      return await sendKey('recent');
    });

    // Send Text Input
    registerAsyncMethod('sendText', (args) async {
      final text = args['text'];
      return await sendText(text);
    });

    // Get Connection Status
    registerMethod('isConnected', (args) => WebRTCService().isDataChannelOpen);

    // Check if Accessibility Service is enabled
    registerAsyncMethod('isAccessibilityEnabled', (args) async {
      final isEnabled = await _channel.invokeMethod('isAccessibilityEnabled');
      return isEnabled == true;
    });

    // Open Accessibility Settings
    registerAsyncMethod('openAccessibilitySettings', (args) async {
      await _channel.invokeMethod('openAccessibilitySettings');
      return true;
    });

    // Copy to Clipboard
    registerAsyncMethod('copyToClipboard', (args) async {
      final text = args['text'];
      if (text != null) {
        await Clipboard.setData(ClipboardData(text: text));
        return true;
      }
      return false;
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  /// Stop control server
  Future<bool> stopServer() async {
    return true;
  }

  /// Public Method: Process control command (From WebRTC)
  Future<void> processCommand(Map<String, dynamic> command) async {
    final action = command['action'];
    final params = command['params'] ?? {};

    switch (action) {
      case 'click':
        await _injectClick(params['x'], params['y']);
        break;
      case 'swipe':
        await _injectSwipe(
          params['startX'],
          params['startY'],
          params['endX'],
          params['endY'],
          params['duration'],
        );
        break;
      case 'longPress':
        await _injectLongPress(params['x'], params['y'], params['duration']);
        break;
      case 'key':
        await _injectKey(params['key']);
        break;
      case 'text':
        await _injectText(params['text']);
        break;
      case 'webrtc_signal':
        controller
            ?.getService<NativeEventService>()
            ?.emit('webrtc_remote_signal', params);
        break;
    }

    // Send execution result
    _sendResponse({'action': action, 'success': true});
  }

  /// Send response to controller
  void _sendResponse(Map<String, dynamic> response) {
    // Try WebRTC first
    final webrtc = WebRTCService();
    if (webrtc.isDataChannelOpen) {
      webrtc.sendControlData(response);
      return;
    }
  }

  /// Controlled Side: Send screen frame data to controller
  void sendScreenFrame(Map<String, dynamic> frameData) {
    try {
      // final dataContent = frameData['data'];
      // int size = 0;
      // if (dataContent is List) {
      //   size = dataContent.length;
      // } else if (dataContent is String) {
      //   size = dataContent.length;
      // }
      // debugPrint(
      //     'ControlService: Sending screen frame via WebRTC (size: $size, ts: ${frameData['timestamp']})');

      final data = {
        'type': 'screen_frame',
        'data': frameData,
      };
      final jsonStr = jsonEncode(data);

      // Try WebRTC Channel first
      final webrtc = WebRTCService();
      if (webrtc.isDataChannelOpen) {
        webrtc.sendData(jsonStr);
        return;
      } else {
        // debugPrint('ControlService: WebRTC DataChannel is NOT open, cannot send frame');
      }
    } catch (e) {
      debugPrint('ControlService: Error sending screen frame: $e');
    }
  }

  // ==================== Controller Methods ====================

  /// Disconnect
  Future<bool> disconnect() async {
    await WebRTCService().stopCall();
    return true;
  }

  /// Send Click Event
  Future<bool> sendClick(double x, double y) async {
    return _sendCommand({
      'action': 'click',
      'params': {'x': x, 'y': y}
    });
  }

  /// Send Swipe Event
  Future<bool> sendSwipe(
    double startX,
    double startY,
    double endX,
    double endY,
    int duration,
  ) async {
    return _sendCommand({
      'action': 'swipe',
      'params': {
        'startX': startX,
        'startY': startY,
        'endX': endX,
        'endY': endY,
        'duration': duration,
      },
    });
  }

  /// Send Long Press Event
  Future<bool> sendLongPress(double x, double y, int duration) async {
    return _sendCommand({
      'action': 'longPress',
      'params': {'x': x, 'y': y, 'duration': duration},
    });
  }

  /// Send Key Event
  Future<bool> sendKey(String key) async {
    return _sendCommand({
      'action': 'key',
      'params': {'key': key}
    });
  }

  /// Send Text
  Future<bool> sendText(String text) async {
    return _sendCommand({
      'action': 'text',
      'params': {'text': text}
    });
  }

  /// Send Control Command
  Future<bool> _sendCommand(Map<String, dynamic> command) async {
    // Try WebRTC first
    final webrtc = WebRTCService();
    if (webrtc.isDataChannelOpen) {
      return await webrtc.sendData(jsonEncode(command));
    }

    return false;
  }

  /// Process Response Data
  void processResponse(Map<String, dynamic> response) {
    // Check if it is screen frame data
    if (response['type'] == 'screen_frame') {
      // final frameData = response['data'] as Map;
      // final dataContent = frameData['data'];
      // int size = 0;
      // if (dataContent is List) {
      //   size = dataContent.length;
      // } else if (dataContent is String) {
      //   size = dataContent.length;
      // }
      // debugPrint(
      //    'ControlService: Emitting screen_frame to JS (img size: $size, ts: ${frameData['timestamp']})');

      controller
          ?.getService<NativeEventService>()
          ?.emit('screen_frame', response['data']);
      return;
    }

    // Check if it is WebRTC signal
    if (response['action'] == 'webrtc_signal') {
      controller
          ?.getService<NativeEventService>()
          ?.emit('webrtc_remote_signal', response['params']);
      return;
    }

    controller
        ?.getService<NativeEventService>()
        ?.emit('command_response', response);
  }

  // ==================== Controlled Side - Event Injection ====================

  Future<void> _injectClick(double x, double y) async {
    await _channel.invokeMethod('injectClick', {'x': x, 'y': y});
  }

  Future<void> _injectSwipe(
    double startX,
    double startY,
    double endX,
    double endY,
    int duration,
  ) async {
    await _channel.invokeMethod('injectSwipe', {
      'startX': startX,
      'startY': startY,
      'endX': endX,
      'endY': endY,
      'duration': duration,
    });
  }

  Future<void> _injectLongPress(double x, double y, int duration) async {
    await _channel.invokeMethod('injectLongPress', {
      'x': x,
      'y': y,
      'duration': duration,
    });
  }

  Future<void> _injectKey(String key) async {
    await _channel.invokeMethod('injectKey', {'key': key});
  }

  Future<void> _injectText(String text) async {
    await _channel.invokeMethod('injectText', {'text': text});
  }
}
