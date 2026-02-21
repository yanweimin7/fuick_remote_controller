import 'package:flutter/material.dart';
import 'package:fuickjs_flutter/core/engine/fuick_app_context.dart';
import 'package:fuickjs_flutter/core/engine/fuick_app_context_manager.dart';
import 'package:fuickjs_flutter/core/container/fuick_app_controller.dart'
    as fuick;
import 'package:remote_control_app/widgets/rtc_video_view_parser.dart';

import 'home_page.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  @override
  void initState() {
    super.initState();
    _initApp();
  }

  Future<void> _initApp() async {
    final appContext = FuickAppContext(appName: 'anylink_controller');

    // Register custom widgets
    fuick.widgetFactory.register(RTCVideoViewParser());

    FuickAppContextManager().registerContext('anylink_controller', appContext);
    // Minimum display time 500ms
    final minDisplayTime = Future.delayed(const Duration(milliseconds: 500));
    try {
      await appContext.init();
    } catch (e) {
      debugPrint('App initialization failed: $e');
      // Attempt to enter home page even if failed, or show error page
    }
    // Ensure minimum display time
    await minDisplayTime;

    if (!mounted) return;

    // Navigate to home page
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (context) => const HomePage(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Logo can be placed here
            Icon(
              Icons.account_balance_wallet,
              size: 80,
              color: Colors.blue,
            ),
            SizedBox(height: 24),
            Text(
              'AnyLink',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.blue,
              ),
            ),
            SizedBox(height: 48),
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text(
              'Initializing...',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        ),
      ),
    );
  }
}
