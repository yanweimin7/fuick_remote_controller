/// 应用运行模式
enum AppMode {
  /// 未选择
  none,
  
  /// 控制端 - 控制其他设备
  controller,
  
  /// 被控端 - 被其他设备控制
  controlee,
}

/// 全局应用状态管理
class AppState {
  static final AppState _instance = AppState._internal();
  factory AppState() => _instance;
  AppState._internal();
  
  AppMode currentMode = AppMode.none;
  String? deviceId;
  String? deviceName;
  
  // 被控端信息
  String? controleeIp;
  int? controleePort;
  
  // 控制端信息
  String? controllerIp;
  int? controllerPort;
}
