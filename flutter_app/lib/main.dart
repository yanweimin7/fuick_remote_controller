import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/engine/engine.dart';
import 'package:remote_control_app/splash_page.dart';

import 'services/control_service.dart';
import 'services/network_discovery_service.dart';
import 'services/screen_capture_service.dart';
import 'services/signaling_service.dart';
import 'services/storage_service.dart';
import 'services/webrtc_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Set preferred orientations
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  EngineInit.initIsolate();

  // Register Native Services
  ScreenCaptureService().register();
  ControlService().register();
  NetworkDiscoveryService().register();
  WebRTCService().register();
  SignalingService().register();
  StorageService().register();

  runApp(const AnyLinkApp());
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
