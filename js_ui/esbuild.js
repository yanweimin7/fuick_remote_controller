const esbuild = require("esbuild");
const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");

const isWatch = process.argv.includes("--watch");
// --dev 产出未压缩 + React development + sourcemap 的包。
// 压缩版把组件名抹掉，React 只剩 "Minified React error #130"，无法定位是哪个
// 组件为 undefined；排查 #130 时必须用这个模式。
const isDev = isWatch || process.argv.includes("--dev");
const QJSC_PATH = path.resolve(
  __dirname,
  "../../fuickjs_engine/src/main/jni/quickjs/build/qjsc",
);

function createReactPlugin(isProd) {
  const reactCjsDir = path.resolve(__dirname, "node_modules/react/cjs");
  const reactFiles = {
    react: isProd ? "react.production.min.js" : "react.development.js",
    "react/jsx-runtime": isProd
      ? "react-jsx-runtime.production.min.js"
      : "react-jsx-runtime.development.js",
    "react/jsx-dev-runtime": isProd
      ? "react-jsx-dev-runtime.production.min.js"
      : "react-jsx-dev-runtime.development.js",
  };
  return {
    name: "react-resolve",
    setup(build) {
      build.onResolve({ filter: /^react(\/jsx(-dev)?-runtime)?$/ }, (args) => ({
        path: path.join(reactCjsDir, reactFiles[args.path]),
      }));
    },
  };
}

async function build() {
  const isProd = !isDev;

  const reconcilerPath = isProd
    ? "node_modules/react-reconciler/cjs/react-reconciler.production.min.js"
    : "node_modules/react-reconciler/cjs/react-reconciler.development.js";
  const schedulerPath = isProd
    ? "node_modules/scheduler/cjs/scheduler.production.min.js"
    : "node_modules/scheduler/cjs/scheduler.development.js";

  const commonOptions = {
    bundle: true,
    platform: "neutral",
    format: "iife",
    target: "es2020",
    minify: isProd,
    sourcemap: !isProd,
    mainFields: ["module", "main"],
    define: {
      "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
    },
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
  };

  const destDir = path.resolve(__dirname, "../flutter_app/assets/js");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    console.log("Building single bundle...");
    await esbuild.build({
      ...commonOptions,
      entryPoints: ["src/index.ts"],
      outfile: "dist/anylink_controller.js",
      globalName: "AnyLinkController",
      plugins: [createReactPlugin(isProd)],
      alias: {
        "react-reconciler": path.resolve(__dirname, reconcilerPath),
        scheduler: path.resolve(__dirname, schedulerPath),
        fuickjs: path.resolve(
          __dirname,
          "../../fuickjs_framework/fuickjs/dist/index.js",
        ),
      },
    });

    const src = path.resolve(__dirname, "dist/anylink_controller.js");
    const dest = path.join(destDir, "anylink_controller.js");
    const destBin = path.join(destDir, "anylink_controller.qjc");

    fs.copyFileSync(src, dest);
    console.log(`Copied anylink_controller to ${dest}`);

    if (fs.existsSync(QJSC_PATH)) {
      console.log("Compiling anylink_controller to QuickJS bytecode...");
      execSync(`${QJSC_PATH} -b -o ${destBin} ${src}`);
      console.log(`Compiled to ${destBin}`);
    } else {
      // 编译器不在就绝不能留下旧的 .qjc：_loadFromAssets 在 useAotCode 开启时
      // 优先加载 .qjc，一份陈旧字节码会把刚构建的 JS 整个遮蔽，且不报错
      // （表现为"改了代码没生效"）。宁可没有字节码。
      if (fs.existsSync(destBin)) {
        fs.unlinkSync(destBin);
        console.log(
          `Removed stale ${destBin} (qjsc not found at ${QJSC_PATH}) — ` +
            "it would shadow the freshly built JS when useAotCode is on",
        );
      }
    }

    const oldFiles = ["framework.bundle.js", "framework.bundle.qjc"];
    for (const f of oldFiles) {
      const fp = path.join(destDir, f);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        console.log(`Removed old split bundle: ${f}`);
      }
    }

    if (isWatch) {
      console.log(
        "Watch mode is not fully implemented in this script yet, but build completed.",
      );
    }
  } catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
  }
}

build();
