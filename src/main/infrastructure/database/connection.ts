import path from 'node:path';
import fs from 'node:fs';

import { app } from 'electron';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from './migrate';
import { ensureDatabaseDirectory } from './databasePath';

let sqlite: Database.Database | null = null;

let db: BetterSQLite3Database<typeof schema> | null = null;

export function initializeDatabase() {
  if (db) return db;

  const dbPath = ensureDatabaseDirectory();

  fs.mkdirSync(path.dirname(dbPath), {
    recursive: true,
  });

  sqlite = new Database(dbPath);

  // 外键约束
  sqlite.pragma('foreign_keys = ON');

  // WAL 模式
  sqlite.pragma('journal_mode = WAL');

  db = drizzle(sqlite, { schema });

  if (app.isPackaged || process.env.AAI_MIGRATE === '1') {
    // 发布流程：启动时应用版本化迁移（drizzle-kit generate 的产物）
    runMigrations(db);
  } else {
    // 开发流程：schema 由 `npm run db:push` 管理，启动时跳过迁移。
    // push 同步过的库没有 __drizzle_migrations 日志，再跑迁移会重复建表，
    // 所以两条流程不要混在同一个库上（要体验发布流程请换空库或删掉开发库）。
    console.log(
      '[Database] Dev mode: schema managed by `npm run db:push`, startup migrate skipped',
    );
  }

  console.log('[Database] Connected:', dbPath);

  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database is not initialized');
  }

  return db;
}

export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
