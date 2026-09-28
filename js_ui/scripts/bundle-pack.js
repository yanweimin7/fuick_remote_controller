#!/usr/bin/env node
/**
 * anylink_controller bundle 打包：将 esbuild 产物 + 可选图片资源打成签名 zip。
 *
 *   node scripts/bundle-pack.js [--version 1.0.0] [--copy-app] [--copy-demo]
 *
 * 打包本身委托给 fuickjs_demo 的标准打包器 pack-bundle.js —— 与 demo 的
 * pack-all.js、fly 的 bundle-pack.js 完全同一条链路，保证 manifest 结构、
 * assets 收录、mtime 归一与签名逻辑一致，不另起一套实现。
 *
 * 落地目标（可组合）：
 *   （默认）  只产出 js_ui/dist/anylink_controller-<version>.zip
 *   --copy-app   落地到 fuick_remote_controller/flutter_app 内置包
 *   --copy-demo  落地到 fuickjs_demo/app 内置包（demo 首页列表会出现 AnyLink）
 *
 * 注意：只打 .js，绝不打 .qjc。字节码由引擎在端上编译（sha 随引擎版本变化，
 * 纳入 manifest 会让后台重编把包判成"被篡改"）。详见
 * fuickjs_framework/docs/bundle-delivery.md §5.1。
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

/* ── 路径 ─────────────────────────────────────────────────────────── */
const JS_UI = path.resolve(__dirname, "..");
const DIST = path.join(JS_UI, "dist");
const ASSETS = path.join(JS_UI, "assets");
const FLUTTER_APP = path.resolve(JS_UI, "..", "flutter_app");
const APP_JS = path.join(FLUTTER_APP, "assets", "js");

const DEMO_ROOT = path.resolve(JS_UI, "..", "..", "fuickjs_demo");
const DEMO_JS = path.join(DEMO_ROOT, "js");
const DEMO_APP_JS = path.join(DEMO_ROOT, "app", "assets", "js");
const DEMO_KEY = path.join(
  DEMO_JS,
  "tools",
  "bundle",
  "bundle_signing_key.pem",
);
const PACK_BUNDLE = path.join(DEMO_JS, "tools", "bundle", "pack-bundle.js");

/** 必须与 flutter_app/lib/splash_page.dart 的 appName 一致 */
const BUNDLE_NAME = "anylink_controller";
const BUNDLE_LABEL = "AnyLink";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_MIN_APP_VERSION = "1.0.0";

/* ── 工具函数 ─────────────────────────────────────────────────────── */
function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function parseArgs() {
  const args = {
    version: DEFAULT_VERSION,
    minAppVersion: DEFAULT_MIN_APP_VERSION,
    keyId: "demo-key",
    key: null,
    copyApp: false,
    copyDemo: false,
  };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--version") args.version = process.argv[++i];
    else if (a === "--minAppVersion") args.minAppVersion = process.argv[++i];
    else if (a === "--keyId") args.keyId = process.argv[++i];
    else if (a === "--key") args.key = path.resolve(process.argv[++i]);
    else if (a === "--copy" || a === "--copy-app") args.copyApp = true;
    else if (a === "--copy-demo") args.copyDemo = true;
  }
  return args;
}

/**
 * 把 zip 落地为一个宿主工程的内置包。
 *
 * 落地两件东西（缺一不可）：
 *   <assetsJs>/<name>.zip   内置包本体，离线模块懒解压出图片目录
 *   <assetsJs>/bundles.json upsert 对应条目，宿主据此识别内置包
 * 并额外拷贝 <name>.js —— zip 缺失时框架回退直读 assets 里的源码。
 */
function landBuiltinPackage(assetsJs, zipPath, args, zipSha256) {
  fs.mkdirSync(assetsJs, { recursive: true });

  const zipDest = path.join(assetsJs, `${BUNDLE_NAME}.zip`);
  fs.copyFileSync(zipPath, zipDest);

  const jsSrc = path.join(DIST, `${BUNDLE_NAME}.js`);
  if (fs.existsSync(jsSrc)) {
    fs.copyFileSync(jsSrc, path.join(assetsJs, `${BUNDLE_NAME}.js`));
  }

  const bundlesJsonPath = path.join(assetsJs, "bundles.json");
  let existing = { packages: [] };
  if (fs.existsSync(bundlesJsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(bundlesJsonPath, "utf8"));
    } catch {
      /* 解析失败则从空列表重建 */
    }
  }

  const entry = {
    name: BUNDLE_NAME,
    version: args.version,
    sha256: zipSha256,
    minAppVersion: args.minAppVersion,
    label: BUNDLE_LABEL,
    initialRoute: "/",
  };

  const packages = existing.packages || [];
  const idx = packages.findIndex((p) => p.name === BUNDLE_NAME);
  if (idx >= 0) {
    packages[idx] = entry;
  } else {
    packages.push(entry);
  }
  existing.packages = packages;

  fs.writeFileSync(
    bundlesJsonPath,
    JSON.stringify(existing, null, 2) + "\n",
  );

  console.log(`已落地  : ${zipDest}`);
  console.log(`已更新  : ${bundlesJsonPath}  (${packages.length} packages)`);
}

/* ── 主流程 ───────────────────────────────────────────────────────── */
function main() {
  const args = parseArgs();
  const key = args.key || DEMO_KEY;

  // esbuild 的 outfile；同时是 flutter_app/assets/js 下的产物
  const bundleJs = path.join(DIST, `${BUNDLE_NAME}.js`);
  if (!fs.existsSync(bundleJs)) {
    console.error(`找不到 ${bundleJs}，请先 npm run build`);
    process.exit(1);
  }
  if (!fs.existsSync(key)) {
    console.error(
      "找不到签名私钥:",
      key,
      "（demo 工程请先 cd fuickjs_demo/js && npm run bundle:keys）",
    );
    process.exit(1);
  }
  if (!fs.existsSync(PACK_BUNDLE)) {
    console.error("找不到 demo 标准打包器:", PACK_BUNDLE);
    process.exit(1);
  }

  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), "anylink-pack-"));

  // 1. 委托 demo 标准打包器
  const packArgs = [
    PACK_BUNDLE,
    "--name",
    BUNDLE_NAME,
    "--version",
    args.version,
    "--key",
    key,
    "--keyId",
    args.keyId,
    "--minAppVersion",
    args.minAppVersion,
    "--js",
    bundleJs,
    "--out",
    tmpOut,
  ];
  if (fs.existsSync(ASSETS)) {
    packArgs.push("--assets", ASSETS);
  } else {
    console.log("（无 js_ui/assets，跳过图片资源收录）");
  }
  execFileSync(process.execPath, packArgs, { stdio: "inherit" });

  // 2. 落到 js_ui/dist
  const zipName = `${BUNDLE_NAME}-${args.version}.zip`;
  const zipTmp = path.join(tmpOut, zipName);
  fs.mkdirSync(DIST, { recursive: true });
  const zipPath = path.join(DIST, zipName);
  fs.copyFileSync(zipTmp, zipPath);
  const zipSha256 = sha256File(zipPath);

  console.log(`\n结果: ${zipPath}`);
  console.log(`  version   : ${args.version}`);
  console.log(`  keyId     : ${args.keyId}`);
  console.log(`  sha256    : ${zipSha256}`);

  // 3. 可选：落地为宿主工程的内置包
  if (args.copyApp) {
    landBuiltinPackage(APP_JS, zipPath, args, zipSha256);
  }
  if (args.copyDemo) {
    landBuiltinPackage(DEMO_APP_JS, zipPath, args, zipSha256);
  }

  fs.rmSync(tmpOut, { recursive: true, force: true });

  console.log("\n版本元数据示例（latest.json 的 packages[] 项）：");
  console.log(
    JSON.stringify(
      {
        name: BUNDLE_NAME,
        version: args.version,
        sha256: zipSha256,
        url: `https://YOUR_CDN/${zipName}`,
        minAppVersion: args.minAppVersion,
      },
      null,
      2,
    ),
  );
}

main();
