import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/container/fuick_app_view.dart';
import 'package:fuickjs_flutter/core/engine/engine.dart';

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
      // 直接加载 FuickJS 页面作为首页
      home: const FuickAppView(
        appName: 'remote_controller',
        initialRoute: '/', // 对应 js_ui/src/app.ts 中的注册路由
        initialParams: {},
      ),
    );
  }
}
