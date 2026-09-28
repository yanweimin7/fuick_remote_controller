import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fuickjs_flutter/offline/domain/services/bundle_verifier.dart';
import 'package:fuickjs_flutter/offline/offline.dart';
import 'package:remote_control_app/offline_bootstrap.dart';

/// 把 path_provider 指向临时目录，避开真实平台通道。
///
/// channel 名硬编码在 path_provider_platform_interface 的
/// `method_channel_path_provider.dart`（'plugins.flutter.io/path_provider'）。
Future<void> _mockPathProvider(String dir) async {
  const channel = MethodChannel('plugins.flutter.io/path_provider');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
    if (call.method == 'getApplicationDocumentsDirectory') return dir;
    return null;
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tmp;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('anylink_offline_test_');
  });

  tearDown(() async {
    if (await tmp.exists()) await tmp.delete(recursive: true);
  });

  test('启动配置能通过同步校验（信任链未被关掉）', () {
    expect(AnyLinkOfflineBootstrap.validate, returnsNormally);
  });

  test('内置包能经 promoteAndGetRoot 提升为 active', () async {
    await _mockPathProvider(tmp.path);

    await Offline.init(AnyLinkOfflineBootstrap.buildConfig());
    await Offline.whenInitialized;

    final root =
        await Offline.promoteAndGetRoot(AnyLinkOfflineBootstrap.bundleName);

    expect(root, isNotNull,
        reason: 'promoteAndGetRoot 返回 null → 引擎会静默回落到 assets/js/*.js '
            '直读，整套验签与包管理被绕过');
    expect(root, isNotEmpty);

    // 解压产物必须包含 bundle.js 与两个签名文件
    expect(File('$root/${BundleVerifier.manifestFileName}').existsSync(), isTrue,
        reason: '缺 manifest.json');
    expect(File('$root/${BundleVerifier.manifestSigFileName}').existsSync(), isTrue,
        reason: '缺 manifest.sig');
    expect(File('$root/bundle.js').existsSync(), isTrue, reason: '缺 bundle.js');
  });

  test('提取出的目录能通过 Ed25519 验签', () async {
    await _mockPathProvider(tmp.path);

    await Offline.init(AnyLinkOfflineBootstrap.buildConfig());
    await Offline.whenInitialized;

    final root =
        await Offline.promoteAndGetRoot(AnyLinkOfflineBootstrap.bundleName);
    expect(root, isNotNull);

    // 直接用框架自身的 verifier，避免测试里另写一份规范化逻辑而掩盖问题
    final verifier = BundleVerifier(
      publicKeysB64: {
        AnyLinkOfflineBootstrap.signingKeyId: AnyLinkOfflineBootstrap.signingPubB64
      },
    );
    final result = await verifier.verifyDir(root!);

    expect(result.ok, isTrue, reason: '验签失败: ${result.reason}');
    expect(result.manifest, isNotNull);
  });

  test('错误的公钥会导致验签失败（证明上一步不是空跑）', () async {
    await _mockPathProvider(tmp.path);

    await Offline.init(AnyLinkOfflineBootstrap.buildConfig());
    await Offline.whenInitialized;

    final root =
        await Offline.promoteAndGetRoot(AnyLinkOfflineBootstrap.bundleName);
    expect(root, isNotNull);

    // 换成另一把合法格式但不同的公钥：必须失败，否则说明前一个测试恒真
    final wrongVerifier = BundleVerifier(
      publicKeysB64: {
        AnyLinkOfflineBootstrap.signingKeyId:
            'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE='
      },
    );
    final result = await wrongVerifier.verifyDir(root!);

    expect(result.ok, isFalse,
        reason: '换了公钥仍验签通过 → 验签逻辑没真正生效，测试无意义');
  });

  test('bundles.json 能被解析出内置包，且 sha256 与磁盘上的 zip 一致', () async {
    await _mockPathProvider(tmp.path);

    await Offline.init(AnyLinkOfflineBootstrap.buildConfig());
    await Offline.whenInitialized;

    final internal = Offline.packageService.internalPackages
        .where((p) => p.name == AnyLinkOfflineBootstrap.bundleName)
        .toList();
    expect(internal, hasLength(1),
        reason: 'bundles.json 未被解析为内置包');

    final pkg = internal.single;
    expect(pkg.version, isNotEmpty);
    expect(pkg.sha256, hasLength(64), reason: 'sha256 必须是 64 位 hex');

    // 与 assets 里实际 zip 的摘要比对，防止改了包忘了同步 bundles.json
    final bytes = await rootBundle.load(
      'assets/js/${AnyLinkOfflineBootstrap.bundleName}.zip',
    );
    final actual = _sha256(bytes.buffer.asUint8List());
    expect(actual, pkg.sha256,
        reason: 'bundles.json 的 sha256 与 zip 实际内容不一致 —— '
            '重新执行 npm run bundle:pack:app');
  });
}

/// 与框架同算法的独立实现，仅用于比对 assets 字节流。
String _sha256(List<int> data) => sha256.convert(data).toString();
