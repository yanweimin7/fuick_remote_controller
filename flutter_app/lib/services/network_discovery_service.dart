import 'dart:async';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';

/// 网络发现服务 - 简化版：仅获取本地信息
class NetworkDiscoveryService extends BaseFuickService {
  static final NetworkDiscoveryService _instance =
      NetworkDiscoveryService._internal();
  factory NetworkDiscoveryService() => _instance;
  @override
  String get name => 'NetworkDiscovery';

  NetworkDiscoveryService._internal() {
    // 获取本机信息
    registerMethod('getDeviceInfo', (args) async {
      return await _getDeviceInfo();
    });

    // 获取本机 IP 地址
    registerMethod('getLocalIp', (args) async {
      return await _getLocalIp();
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  /// 获取本机 IP 地址
  Future<String?> _getLocalIp() async {
    try {
      print('NetworkDiscovery: Listing network interfaces...');
      String? bestIp;

      for (var interface in await NetworkInterface.list()) {
        print('NetworkDiscovery: Found interface: ${interface.name}');
        for (var addr in interface.addresses) {
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            print('NetworkDiscovery:   - ${addr.address} (${addr.type.name})');

            // 优先选择 wlan0 (Android WiFi) 或 en0 (iOS WiFi) 或 eth0 (Ethernet)
            if (interface.name.startsWith('wlan') ||
                interface.name.startsWith('en') ||
                interface.name.startsWith('eth')) {
              bestIp = addr.address;
            } else if (bestIp == null) {
              bestIp = addr.address;
            }
          }
        }
      }

      if (bestIp != null) {
        print('NetworkDiscovery: Selected IP: $bestIp');
        return bestIp;
      }
    } catch (e) {
      print('Get local IP error: $e');
    }
    return null;
  }

  /// 获取设备信息
  Future<Map<String, dynamic>> _getDeviceInfo() async {
    final deviceInfo = DeviceInfoPlugin();
    String name;
    String id;

    if (Platform.isAndroid) {
      final androidInfo = await deviceInfo.androidInfo;
      name = androidInfo.model;
      id = androidInfo.id;
    } else if (Platform.isIOS) {
      final iosInfo = await deviceInfo.iosInfo;
      name = iosInfo.name;
      id = iosInfo.identifierForVendor ?? 'unknown';
    } else {
      name = 'Unknown Device';
      id = 'unknown';
    }

    final ip = await _getLocalIp();

    return {
      'name': name,
      'id': id,
      'ip': ip,
      'platform': Platform.operatingSystem,
    };
  }
}
