import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:fuickjs_flutter/core/logger.dart';
import 'package:fuickjs_flutter/offline/config/offline_config.dart';
import 'package:fuickjs_flutter/offline/offline.dart';

/// AnyLink 的 bundle 下发配置与初始化。
///
/// 参照 `fuickjs_demo/app/lib/offline_bootstrap.dart` 的做法，但面向
/// `flutter_app` 自身。这里**必须**在 `FuickAppContext.init()` 之前调用：
/// 引擎的 `_resolveBundleRoot()` 走 `Offline.promoteAndGetRoot(appName)`，
/// 而该方法在 `_initialized == false` 时直接返回 null —— 也就是静默回落到
/// `assets/js/*.js` 直读，跳过验签、解压与包管理。不调 init 不会报错，只会
/// 悄悄降级，所以这里显式接上。
class AnyLinkOfflineBootstrap {
  /// 与 `bundle-pack.js --keyId` 一致；写入 zip 内 manifest.json，验签时选公钥。
  static const String signingKeyId = 'demo-key';

  /// Ed25519 bundle 签名公钥（base64 原始 32 字节）。
  ///
  /// 与 `fuickjs_demo/js/tools/bundle/bundle_signing_key.pem` 配对。
  /// 重新生成密钥后必须同步更新此常量 + [signingKeyId]，否则引擎会拒绝
  /// 所有包并回落到内置 assets。
  ///
  /// 编进 APK 后是明文，但**不影响安全性**：Ed25519 公钥本来就是公开的，
  /// 要防的是私钥泄露。安全靠私钥只存在于 CI/开发者侧。
  ///
  /// 注意：AnyLink 目前复用 demo 的 demo-key，因此正式发布前应换一把
  /// 独立密钥，并给两个 app 各自的 apk 配好公钥。
  static const String signingPubB64 =
      '0KH8QOyFNIIVNsDwB/3dkWKNLMYW+PwWU/dkvG4ef5A=';

  /// bundle 名称，需与 `assets/js/bundles.json` 的 `name`、
  /// `assets/js/<name>.zip` 以及 `FuickAppContext(appName:)` 三者一致。
  static const String bundleName = 'anylink_controller';

  /// App 版本，与 pubspec.yaml `version:` 对齐。
  static const String appVersion = '1.0.0';

  static OfflineConfig buildConfig() => OfflineConfig(
        envGetter: () => kDebugMode ? 'debug' : 'release',
        appVersionGetter: () => appVersion,
        signaturePublicKeysB64: const {signingKeyId: signingPubB64},
        // AnyLink 目前无 CDN：返回 null 即「无远程配置」，引擎回退
        // 已验签的本地缓存，最后兜底内置包。接真实下发时在这里请求
        // latest.json，并保证其带 Ed25519 签名（_sig/_kid）。
        offlinePackagesGetter: _fetchRemotePackages,
        offlineConfigGetter: () async => null,
        debug: kDebugMode,
        logger: (tag, msg) => logger.d('[$tag] $msg'),
      );

  /// 启动期同步校验：信任链被关掉时**同步抛出**，不等 init 变成失败 Future。
  ///
  /// 宿主 fire-and-forget 调 [init]（见 `init`）时这道闸最容易退化成一条日志，
  /// 所以调用方先过这一关。
  static void validate() {
    Offline.validateConfig(buildConfig());
  }

  /// fire-and-forget 初始化。
  ///
  /// 刻意不 await：`Offline.init` 同步给 `_initFuture` 赋值，而
  /// `promoteAndGetRoot` 会 await `whenInitialized` 接手同一个 Future，
  /// 因此这里不阻塞启动，引擎侧仍能保证「返回 root 前已验签」。
  static void init() {
    unawaited(Offline.init(buildConfig()));
  }

  /// 远程 bundle 元数据。
  ///
  /// 当前无 CDN，返回 null。若要接真实接口，返回体必须满足：
  /// ```json
  /// {
  ///   "_sig": "<base64 Ed25519 sig of canonical(rest)>",
  ///   "_kid": "demo-key",
  ///   "packages": [ ... ]
  /// }
  /// ```
  /// 其中 `canonical(rest)` = 去掉 `_sig`/`_kid` 后的 sorted-keys JSON。
  static Future<Map<String, dynamic>?> _fetchRemotePackages() async => null;
}
