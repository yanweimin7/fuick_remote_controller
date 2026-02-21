/// App running mode
enum AppMode {
  /// Not selected
  none,
  
  /// Controller - Control other devices
  controller,
  
  /// Controlee - Controlled by other devices
  controlee,
}

/// Global app state management
class AppState {
  static final AppState _instance = AppState._internal();
  factory AppState() => _instance;
  AppState._internal();
  
  AppMode currentMode = AppMode.none;
  String? deviceId;
  String? deviceName;
  
  // Controlee info
  String? controleeIp;
  int? controleePort;
  
  // Controller info
  String? controllerIp;
  int? controllerPort;
}
