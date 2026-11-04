import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { dependencies as nativeDependencies } from './release/app/package.json';

import type { Plugin } from 'vite';

const root = __dirname;
const drizzleMigrationsDir = path.join(
  root,
  'src/main/infrastructure/database/migrations',
);

/**
 * 把 drizzle-kit 生成的迁移 SQL 拷到 main 产物旁边，
 * 运行期 migrate() 通过 __dirname 定位（dev 和打包后在 asar 内都能读到）。
 */
function copyDrizzleMigrations(): Plugin {
  return {
    name: 'copy-drizzle-migrations',
    closeBundle() {
      if (!fs.existsSync(drizzleMigrationsDir)) return;
      fs.cpSync(drizzleMigrationsDir, path.join(root, 'release/app/dist/main/migrations'), {
        recursive: true,
      });
    },
  };
}
const nativeModules = Object.keys(nativeDependencies || {});
// Use an array so electron-vite can merge these with its builtin externals.
const external = nativeModules.flatMap((name) => [
  name,
  new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
]);

// Renderer alias
const rendererAliases = {
  '@renderer': path.join(root, 'src/renderer'),
  '@shared': path.join(root, 'src/shared'),
  '@main': path.join(root, 'src/main'),
};

export default defineConfig({
  main: {
    plugins: [copyDrizzleMigrations()],
    resolve: {
      alias: rendererAliases,
    },
    build: {
      outDir: 'release/app/dist/main',
      sourcemap: true,
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/main.ts'),
        external: [...external, 'better-sqlite3'],
        output: { entryFileNames: 'main.js' },
      },
    },
  },
  preload: {
    resolve: {
      alias: rendererAliases,
    },
    build: {
      outDir: 'release/app/dist/preload',
      sourcemap: true,
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/preload.ts'),
        external,
        output: { entryFileNames: 'preload.js' },
      },
    },
  },
  renderer: {
    root: path.join(root, 'src/renderer'),
    base: './',
    resolve: {
      alias: rendererAliases,
    },
    plugins: [react({}), svgr()],
    server: {
      host: 'localhost',
      port: Number(process.env.PORT || 1212),
      strictPort: true,
    },
    build: {
      outDir: path.join(root, 'release/app/dist/renderer'),
      emptyOutDir: true,
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        input: path.join(root, 'src/renderer/index.html'),
        output: { entryFileNames: 'renderer.js' },
      },
    },
  },
});
