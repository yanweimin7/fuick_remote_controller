import 'dart:async';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:fuickjs_flutter/core/service/base_fuick_service.dart';
import 'package:fuickjs_flutter/core/service/native_services.dart';

/// Network Discovery Service - Simplified: Get local info only
class NetworkDiscoveryService extends BaseFuickService {
  static final NetworkDiscoveryService _instance =
      NetworkDiscoveryService._internal();
  factory NetworkDiscoveryService() => _instance;
  @override
  String get name => 'NetworkDiscovery';

  NetworkDiscoveryService._internal() {
    // Get local device info
    registerMethod('getDeviceInfo', (args) async {
      return await _getDeviceInfo();
    });

    // Get local IP address
    registerMethod('getLocalIp', (args) async {
      return await _getLocalIp();
    });
  }

  void register() {
    NativeServiceManager().registerService(() => this);
  }

  /// Get local IP address
  Future<String?> _getLocalIp() async {
    try {
      // print('NetworkDiscovery: Listing network interfaces...');
      String? bestIp;

      for (var interface in await NetworkInterface.list()) {
        // print('NetworkDiscovery: Found interface: ${interface.name}');
        for (var addr in interface.addresses) {
          if (addr.type == InternetAddressType.IPv4 && !addr.isLoopback) {
            // print('NetworkDiscovery:   - ${addr.address} (${addr.type.name})');

            // Prioritize wlan0 (Android WiFi), en0 (iOS WiFi), or eth0 (Ethernet)
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
        // print('NetworkDiscovery: Selected IP: $bestIp');
        return bestIp;
      }
    } catch (e) {
      print('Get local IP error: $e');
    }
    return null;
  }

  /// Get device info
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
