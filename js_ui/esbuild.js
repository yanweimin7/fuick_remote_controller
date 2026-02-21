const esbuild = require('esbuild');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');
const QJSC_PATH = path.resolve(__dirname, '../../fuickjs_engine/src/main/jni/quickjs/build/qjsc');

const globalsPlugin = {
  name: 'globals',
  setup(build) {
    build.onResolve({ filter: /^react$/ }, args => ({ path: args.path, namespace: 'globals' }))
    build.onResolve({ filter: /^fuickjs$/ }, args => ({ path: args.path, namespace: 'globals' }))
    build.onLoad({ filter: /.*/, namespace: 'globals' }, args => {
      if (args.path === 'react') return { contents: 'module.exports = globalThis.React', loader: 'js' }
      if (args.path === 'fuickjs') return { contents: 'module.exports = globalThis.FuickFramework', loader: 'js' }
    })
  },
}

async function build() {
  const isProd = !isWatch;

  const reactPath = isProd
    ? 'node_modules/react/cjs/react.production.min.js'
    : 'node_modules/react/cjs/react.development.js';
  const reconcilerPath = isProd
    ? 'node_modules/react-reconciler/cjs/react-reconciler.production.min.js'
    : 'node_modules/react-reconciler/cjs/react-reconciler.development.js';
  const schedulerPath = isProd
    ? 'node_modules/scheduler/cjs/scheduler.production.min.js'
    : 'node_modules/scheduler/cjs/scheduler.development.js';

  const commonOptions = {
    bundle: true,
    platform: 'neutral',
    format: 'iife',
    target: 'es2020',
    minify: isProd,
    sourcemap: !isProd,
    mainFields: ['module', 'main'],
    define: {
      'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
    },
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
  };

  const destDir = path.resolve(__dirname, '../flutter_app/assets/js');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    // 1. Build Framework
    console.log('Building framework bundle...');
    await esbuild.build({
      ...commonOptions,
      entryPoints: ['src/framework_entry.ts'],
      outfile: 'dist/framework.bundle.js',
      globalName: 'FuickJS',
      alias: {
        'react': path.resolve(__dirname, reactPath),
        'react-reconciler': path.resolve(__dirname, reconcilerPath),
        'scheduler': path.resolve(__dirname, schedulerPath),
        'fuickjs': path.resolve(__dirname, '../../fuickjs_framework/fuickjs/dist/index.js'),
      },
    });

    // 2. Build Business
    console.log('Building business bundle...');
    await esbuild.build({
      ...commonOptions,
      entryPoints: ['src/index.ts'],
      outfile: 'dist/anylink_controller.js',
      plugins: [globalsPlugin],
    });

    const bundles = [
      { name: 'framework.bundle', src: 'dist/framework.bundle.js' },
      { name: 'anylink_controller', src: 'dist/anylink_controller.js' },
    ];

    for (const b of bundles) {
      const src = path.resolve(__dirname, b.src);
      const dest = path.join(destDir, `${b.name}.js`);
      const destBin = path.join(destDir, `${b.name}.qjc`);

      // Copy JS
      fs.copyFileSync(src, dest);
      console.log(`Copied ${b.name} to ${dest}`);

      // Compile to QuickJS bytecode
      if (fs.existsSync(QJSC_PATH)) {
        console.log(`Compiling ${b.name} to QuickJS bytecode...`);
        execSync(`${QJSC_PATH} -b -o ${destBin} ${src}`);
        console.log(`Compiled to ${destBin}`);
      }
    }

    if (isWatch) {
      console.log('Watch mode is not fully implemented in this script yet, but build completed.');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
