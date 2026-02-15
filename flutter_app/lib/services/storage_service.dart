import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class StorageService extends BaseFuickService {
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  @override
  String get name => 'Storage';

  StorageService._internal() {
    registerAsyncMethod('getString', (args) async {
      final key = args['key'];
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(key);
    });

    registerAsyncMethod('setString', (args) async {
      final key = args['key'];
      final value = args['value'];
      final prefs = await SharedPreferences.getInstance();
      return await prefs.setString(key, value);
    });

    registerAsyncMethod('remove', (args) async {
      final key = args['key'];
      final prefs = await SharedPreferences.getInstance();
      return await prefs.remove(key);
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }
}
