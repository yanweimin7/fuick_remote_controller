import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_event_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:fuickjs_flutter/core/utils/extensions.dart';
import 'webrtc_service.dart';

/// 控制服务 - 处理控制指令和点击事件
class ControlService extends BaseFuickService {
  static final ControlService _instance = ControlService._internal();
  factory ControlService() => _instance;
  @override
  String get name => 'Control';

  static const MethodChannel _channel = MethodChannel('accessibility_control');

  ControlService._internal() {
    // 断开连接
    registerAsyncMethod('disconnect', (args) async {
      return await disconnect();
    });

    // 发送点击事件（控制端调用）
    registerAsyncMethod('sendClick', (args) async {
      final x = args['x'];
      final y = args['y'];
      return await sendClick(x, y);
    });

    // 发送滑动事件（控制端调用）
    registerAsyncMethod('sendSwipe', (args) async {
      final startX = args['startX'];
      final startY = args['startY'];
      final endX = args['endX'];
      final endY = args['endY'];
      final duration = asIntOrNull(args['duration']) ?? 300;
      return await sendSwipe(startX, startY, endX, endY, duration);
    });

    // 发送长按事件（控制端调用）
    registerAsyncMethod('sendLongPress', (args) async {
      final x = args['x'];
      final y = args['y'];
      final duration = args['duration'] ?? 1000;
      return await sendLongPress(x, y, duration);
    });

    // 发送返回键
    registerAsyncMethod('sendBack', (args) async {
      return await sendKey('back');
    });

    // 发送 Home 键
    registerAsyncMethod('sendHome', (args) async {
      return await sendKey('home');
    });

    // 发送最近任务键
    registerAsyncMethod('sendRecent', (args) async {
      return await sendKey('recent');
    });

    // 发送文本输入
    registerAsyncMethod('sendText', (args) async {
      final text = args['text'];
      return await sendText(text);
    });

    // 获取连接状态
    registerMethod('isConnected', (args) => WebRTCService().isDataChannelOpen);

    // 检查 Accessibility 服务是否启用
    registerAsyncMethod('isAccessibilityEnabled', (args) async {
      final isEnabled = await _channel.invokeMethod('isAccessibilityEnabled');
      return isEnabled == true;
    });

    // 打开 Accessibility 设置
    registerAsyncMethod('openAccessibilitySettings', (args) async {
      await _channel.invokeMethod('openAccessibilitySettings');
      return true;
    });

    // 复制到剪贴板
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

  /// 停止控制服务器
  Future<bool> stopServer() async {
    return true;
  }

  /// 公共方法：处理控制指令 (From WebRTC)
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

    // 发送执行结果
    _sendResponse({'action': action, 'success': true});
  }

  /// 发送响应给控制端
  void _sendResponse(Map<String, dynamic> response) {
    // Try WebRTC first
    final webrtc = WebRTCService();
    if (webrtc.isDataChannelOpen) {
      webrtc.sendControlData(response);
      return;
    }
  }

  /// 被控端：发送屏幕帧数据给控制端
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

      // 优先尝试 WebRTC 通道
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

  // ==================== 控制端方法 ====================

  /// 断开连接
  Future<bool> disconnect() async {
    await WebRTCService().stopCall();
    return true;
  }

  /// 发送点击事件
  Future<bool> sendClick(double x, double y) async {
    // print('wine send commne ');
    return _sendCommand({
      'action': 'click',
      'params': {'x': x, 'y': y}
    });
  }

  /// 发送滑动事件
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

  /// 发送长按事件
  Future<bool> sendLongPress(double x, double y, int duration) async {
    return _sendCommand({
      'action': 'longPress',
      'params': {'x': x, 'y': y, 'duration': duration},
    });
  }

  /// 发送按键事件
  Future<bool> sendKey(String key) async {
    return _sendCommand({
      'action': 'key',
      'params': {'key': key}
    });
  }

  /// 发送文本
  Future<bool> sendText(String text) async {
    return _sendCommand({
      'action': 'text',
      'params': {'text': text}
    });
  }

  /// 发送控制命令
  Future<bool> _sendCommand(Map<String, dynamic> command) async {
    // 优先尝试 WebRTC
    final webrtc = WebRTCService();
    if (webrtc.isDataChannelOpen) {
      return await webrtc.sendData(jsonEncode(command));
    }

    return false;
  }

  /// 处理响应数据
  void processResponse(Map<String, dynamic> response) {
    // 检查是否是屏幕帧数据
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

    // 检查是否是 WebRTC 信令
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

  // ==================== 被控端 - 事件注入 ====================

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
