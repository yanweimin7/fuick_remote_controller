import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/engine/engine.dart';

import 'screens/mode_select_screen.dart';
import 'services/control_service.dart';
import 'services/network_discovery_service.dart';
import 'services/screen_capture_service.dart';
import 'services/webrtc_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // 设置首选方向
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  EngineInit.initIsolate();

  // 注册原生服务
  ScreenCaptureService().register();
  ControlService().register();
  NetworkDiscoveryService().register();
  WebRTCService().register();

  runApp(const RemoteControlApp());
}

class RemoteControlApp extends StatelessWidget {
  const RemoteControlApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '远程控制',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const ModeSelectScreen(),
    );
  }
}

/// 加载 JS Bundle 文件
Future<String> loadJSBundle() async {
  try {
    return await rootBundle.loadString('assets/js/bundle.js');
  } catch (e) {
    print('Failed to load JS bundle: $e');
    return '';
  }
}
