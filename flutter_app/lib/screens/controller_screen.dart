import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:fuickjs_flutter/core/container/fuick_app_view.dart';

import '../core/app_mode.dart';

/// 控制端屏幕 - 使用 fuickjs 渲染 UI
class ControllerScreen extends StatefulWidget {
  const ControllerScreen({super.key});

  @override
  State<ControllerScreen> createState() => _ControllerScreenState();
}

class _ControllerScreenState extends State<ControllerScreen> {
  @override
  void initState() {
    super.initState();
    AppState().currentMode = AppMode.controller;
  }

  @override
  Widget build(BuildContext context) {
    return FuickAppView(
      appName: 'remote_controller',
      initialRoute: '/controller',
      initialParams: {
        'mode': 'controller',
        'deviceId': AppState().deviceId,
      },
    );
  }
}
