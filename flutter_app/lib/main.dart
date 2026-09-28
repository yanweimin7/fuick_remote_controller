import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/engine/engine.dart';
import 'package:remote_control_app/offline_bootstrap.dart';
import 'package:remote_control_app/splash_page.dart';

import 'services/control_service.dart';
import 'services/network_discovery_service.dart';
import 'services/screen_capture_service.dart';
import 'services/signaling_service.dart';
import 'services/webrtc_service.dart';

void main() {
  runZonedGuarded<Future<void>>(() async {
    WidgetsFlutterBinding.ensureInitialized();

    // Set preferred orientations
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);

    EngineInit.initIsolate();

    // bundle 验签/解压/包管理。必须在 FuickAppContext.init() 之前：
    // 引擎走 Offline.promoteAndGetRoot(appName)，未 init 时它静默返回 null
    // 并回落到 assets/js/*.js 直读（不报错，但跳过整套信任链）。
    // validate() 同步 fail-fast，init() 本身 fire-and-forget 由引擎接手等待。
    AnyLinkOfflineBootstrap.validate();
    AnyLinkOfflineBootstrap.init();

    // Register Native Services
    ScreenCaptureService().register();
    ControlService().register();
    NetworkDiscoveryService().register();
    WebRTCService().register();
    SignalingService().register();

    runApp(const AnyLinkApp());
  }, (error, stackTrace) {
    debugPrint('Global error caught: $error');
  });
}

class AnyLinkApp extends StatelessWidget {
  const AnyLinkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
        title: 'AnyLink',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
          useMaterial3: true,
        ),
        home: const SplashPage());
  }
}
