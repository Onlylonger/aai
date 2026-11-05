import os from 'node:os';
import path from 'node:path';

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit 配置。
 *
 * - schema 指向应用的 TS Schema；out 指向源码内的迁移目录，
 *   `npm run db:generate` 产出的 SQL 会随源码一起提交进 git
 * - dbCredentials.url 默认指向应用真实使用的开发库，
 *   与 connection.ts 里的取值逻辑保持一致
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/infrastructure/database/schema.ts',
  out: './src/main/infrastructure/database/migrations',
  dbCredentials: {
    url: path.resolve(process.cwd(), 'dev-data/aai.db'),
  },
  strict: true,
  verbose: true,
});
