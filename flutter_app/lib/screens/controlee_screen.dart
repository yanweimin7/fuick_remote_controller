import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/container/fuick_app_view.dart';

import '../core/app_mode.dart';

/// 被控端屏幕 - 使用 fuickjs 渲染 UI
class ControleeScreen extends StatefulWidget {
  const ControleeScreen({super.key});

  @override
  State<ControleeScreen> createState() => _ControleeScreenState();
}

class _ControleeScreenState extends State<ControleeScreen> {
  @override
  void initState() {
    super.initState();
    AppState().currentMode = AppMode.controlee;
  }

  @override
  Widget build(BuildContext context) {
    return FuickAppView(
      appName: 'remote_controller',
      initialRoute: '/controlee',
      initialParams: {
        'mode': 'controlee',
        'deviceId': AppState().deviceId,
      },
    );
  }
}
