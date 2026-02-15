import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:fuickjs_flutter/core/utils/extensions.dart';

/// 控制服务 - 处理控制指令和点击事件
class ControlService extends BaseFuickService {
  static final ControlService _instance = ControlService._internal();
  factory ControlService() => _instance;
  @override
  String get name => 'Control';

  static const MethodChannel _channel = MethodChannel('accessibility_control');

  ServerSocket? _serverSocket;
  Socket? _serverClientSocket; // 被控端：连接进来的控制端 Socket
  Socket? _clientSocket; // 控制端：连接到被控端的 Socket
  bool _isServerRunning = false;
  int _serverPort = 0;

  ControlService._internal() {
    // 启动控制服务器（被控端使用）
    registerMethod('startServer', (args) async {
      final port = asIntOrNull(args['port']) ?? 0; // 0 表示自动分配端口
      return await startServer(port);
    });

    // 停止控制服务器
    registerMethod('stopServer', (args) async {
      return await stopServer();
    });

    // 连接到被控端（控制端使用）
    registerMethod('connect', (args) async {
      final ip = args['ip'];
      final port = asIntOrNull(args['port']) ?? 8080;
      return await connectToControlee(ip, port);
    });

    // 断开连接
    registerMethod('disconnect', (args) async {
      return await disconnect();
    });

    // 发送点击事件（控制端调用）
    registerMethod('sendClick', (args) async {
      final x = args['x'];
      final y = args['y'];
      return await sendClick(x, y);
    });

    // 发送滑动事件（控制端调用）
    registerMethod('sendSwipe', (args) async {
      final startX = args['startX'];
      final startY = args['startY'];
      final endX = args['endX'];
      final endY = args['endY'];
      final duration = args['duration'] ?? 300;
      return await sendSwipe(startX, startY, endX, endY, duration);
    });

    // 发送长按事件（控制端调用）
    registerMethod('sendLongPress', (args) async {
      final x = args['x'];
      final y = args['y'];
      final duration = args['duration'] ?? 1000;
      return await sendLongPress(x, y, duration);
    });

    // 发送返回键
    registerMethod('sendBack', (args) async {
      return await sendKey('back');
    });

    // 发送 Home 键
    registerMethod('sendHome', (args) async {
      return await sendKey('home');
    });

    // 发送最近任务键
    registerMethod('sendRecent', (args) async {
      return await sendKey('recent');
    });

    // 发送文本输入
    registerMethod('sendText', (args) async {
      final text = args['text'];
      return await sendText(text);
    });

    // 获取连接状态
    registerMethod('isConnected', (args) => _clientSocket != null);

    // 获取服务器状态
    registerMethod('isServerRunning', (args) => _isServerRunning);

    // 获取服务器端口
    registerMethod('getServerPort', (args) => _serverPort);
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  /// 启动控制服务器（被控端）
  Future<Map<String, dynamic>> startServer(int port) async {
    try {
      if (_isServerRunning) {
        return {'success': true, 'port': _serverPort};
      }

      // 检查 Accessibility 服务是否启用
      // final isEnabled = await _channel.invokeMethod('isAccessibilityEnabled');
      // if (isEnabled != true) {
      //   // 引导用户开启 Accessibility 服务
      //   await _channel.invokeMethod('openAccessibilitySettings');
      //   return {'success': false, 'error': 'Accessibility service not enabled'};
      // }

      _serverSocket = await ServerSocket.bind(InternetAddress.anyIPv4, port);
      _serverPort = _serverSocket!.port;
      _isServerRunning = true;

      // 监听控制端连接
      _serverSocket!.listen(_onControlClientConnect);

      print('Control server started on port $_serverPort');
      return {'success': true, 'port': _serverPort};
    } catch (e) {
      print('Start server error: $e');
      return {'success': false, 'error': e.toString()};
    }
  }

  /// 停止控制服务器
  Future<bool> stopServer() async {
    try {
      await _serverSocket?.close();
      _serverSocket = null;
      _isServerRunning = false;
      _serverPort = 0;
      return true;
    } catch (e) {
      print('Stop server error: $e');
      return false;
    }
  }

  /// 处理控制端连接
  void _onControlClientConnect(Socket socket) {
    print('Control client connected: ${socket.remoteAddress}');
    _serverClientSocket = socket;

    // 监听控制指令
    socket
        .cast<List<int>>()
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(
          (message) {
            if (message.trim().isNotEmpty) {
              _onControlData(message);
            }
          },
          onError: (e) => print('Control socket error: $e'),
          onDone: () {
            print('Control client disconnected');
            _serverClientSocket = null;
            try {
              ctx.invoke('NativeEvent', 'receive', [
                'onClientConnected',
                {
                  'status': 'disconnected',
                }
              ]);
            } catch (e) {
              debugPrint('Error emitting onClientConnected disconnected: $e');
            }
          },
        );

    // 通知 JS 层有控制端连接
    try {
      ctx.invoke('NativeEvent', 'receive', [
        'onClientConnected',
        {
          'status': 'connected',
          'client': {
            'address': socket.remoteAddress.address,
            'port': socket.remotePort,
            'name': '远程控制端',
          }
        }
      ]);
    } catch (e) {
      debugPrint('Error emitting onClientConnected: $e');
    }
  }

  /// 处理控制数据
  void _onControlData(String data) async {
    try {
      final command = jsonDecode(data);
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
      }

      // 发送执行结果
      _sendResponse({'action': action, 'success': true});
    } catch (e) {
      print('Process control command error: $e');
      _sendResponse({'success': false, 'error': e.toString()});
    }
  }

  /// 发送响应给控制端
  void _sendResponse(Map<String, dynamic> response) {
    _serverClientSocket?.write('${jsonEncode(response)}\n');
  }

  int _frameCount = 0;
  int _totalBytes = 0;
  DateTime _lastLogTime = DateTime.now();

  /// 被控端：发送屏幕帧数据给控制端
  void sendScreenFrame(Map<String, dynamic> frameData) {
    if (_serverClientSocket == null) {
      print(
          'ControlService: Warning - _serverClientSocket is null, cannot send frame');
      return;
    }
    try {
      final data = {
        'type': 'screen_frame',
        'data': frameData,
      };
      final jsonStr = jsonEncode(data);

      // 分块发送
      const chunkSize = 4096;
      final bytes = utf8.encode('$jsonStr\n');
      for (var i = 0; i < bytes.length; i += chunkSize) {
        final end =
            (i + chunkSize < bytes.length) ? i + chunkSize : bytes.length;
        _serverClientSocket!.add(bytes.sublist(i, end));
      }

      _frameCount++;
      _totalBytes += jsonStr.length;

      final now = DateTime.now();
      if (now.difference(_lastLogTime).inSeconds >= 1) {
        print(
            'ControlService: Send FPS: $_frameCount, Rate: ${(_totalBytes / 1024).toStringAsFixed(1)} KB/s');
        _frameCount = 0;
        _totalBytes = 0;
        _lastLogTime = now;
      }
    } catch (e) {
      debugPrint('ControlService: Error sending screen frame: $e');
    }
  }

  // ==================== 控制端方法 ====================

  /// 连接到被控端
  Future<bool> connectToControlee(String ip, int port) async {
    print('Connecting to $ip:$port...');
    try {
      await disconnect();
      // 增加超时时间到 10 秒
      _clientSocket =
          await Socket.connect(ip, port, timeout: Duration(seconds: 10));
      print('Connected to $ip:$port successfully');

      // 监听被控端响应
      _clientSocket!
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
            (message) {
              if (message.trim().isNotEmpty) {
                _onResponseData(message);
              }
            },
            onError: (e) => print('Connection error: $e'),
            onDone: () {
              print('Disconnected from controlee');
              _clientSocket = null;
              try {
                ctx.invoke('NativeEvent', 'receive', ['disconnected', {}]);
              } catch (e) {
                debugPrint('Error emitting disconnected: $e');
              }
            },
          );

      try {
        ctx.invoke('NativeEvent', 'receive', [
          'connected',
          {'ip': ip, 'port': port}
        ]);
      } catch (e) {
        debugPrint('Error emitting connected: $e');
      }
      return true;
    } catch (e) {
      print('Connect error: $e');
      return false;
    }
  }

  /// 断开连接
  Future<bool> disconnect() async {
    try {
      await _clientSocket?.close();
      _clientSocket = null;
      return true;
    } catch (e) {
      return false;
    }
  }

  /// 发送点击事件
  Future<bool> sendClick(double x, double y) async {
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
    if (_clientSocket == null) return false;
    try {
      _clientSocket!.write('${jsonEncode(command)}\n');
      return true;
    } catch (e) {
      print('Send command error: $e');
      return false;
    }
  }

  int _receiveFrameCount = 0;
  int _receiveTotalBytes = 0;
  DateTime _receiveLastLogTime = DateTime.now();

  /// 处理响应数据
  void _onResponseData(String data) {
    try {
      final response = jsonDecode(data);

      // 检查是否是屏幕帧数据
      if (response is Map && response['type'] == 'screen_frame') {
        _receiveFrameCount++;
        _receiveTotalBytes += data.length;

        final now = DateTime.now();
        if (now.difference(_receiveLastLogTime).inSeconds >= 1) {
          print(
              'ControlService: Receive FPS: $_receiveFrameCount, Rate: ${(_receiveTotalBytes / 1024).toStringAsFixed(1)} KB/s');
          _receiveFrameCount = 0;
          _receiveTotalBytes = 0;
          _receiveLastLogTime = now;
        }

        try {
          ctx.invoke(
              'NativeEvent', 'receive', ['screen_frame', response['data']]);
        } catch (e) {
          debugPrint('Error emitting screen_frame: $e');
        }
        return;
      }

      print('ControlService: Received data: $data');

      try {
        ctx.invoke('NativeEvent', 'receive', ['command_response', response]);
      } catch (e) {
        debugPrint('Error emitting command_response: $e');
      }
    } catch (e) {
      print('Parse response error: $e');
    }
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
