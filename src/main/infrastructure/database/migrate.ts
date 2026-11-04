import fs from 'node:fs';
import path from 'node:path';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/**
 * 应用启动时执行 drizzle-kit generate 产出的版本化迁移。
 *
 * - 迁移文件由 `npm run db:generate` 生成并随源码提交；
 * - 构建时 electron.vite.config.ts 的 copyDrizzleMigrations 会把整个迁移目录
 *   拷贝到 main 产物旁边（release/app/dist/main/migrations），
 *   运行期（dev 与打包后）都通过 __dirname 定位，打包后在 asar 内也能读取。
 * - 已应用的迁移记录在 __drizzle_migrations 表，按时间戳幂等跳过。
 */
export function runMigrations<TSchema extends Record<string, unknown>>(
  db: BetterSQLite3Database<TSchema>,
) {
  const migrationsFolder = path.join(__dirname, 'migrations');

  if (!fs.existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) {
    throw new Error(
      `[Migrations] Journal not found in ${migrationsFolder}. ` +
        'Run `npm run db:generate` and rebuild (electron-vite copies the folder next to main.js).',
    );
  }

  migrate(db, { migrationsFolder });

  console.log('[Migrations] Up to date');
}
