import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * 获取数据库文件路径
 */
export function getDatabasePath(): string {
  // 正式环境：使用 Electron 用户数据目录
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'data', 'aai.db');
  }

  // 开发环境：项目内独立数据库
  return path.join(app.getAppPath(), 'dev-data', 'aai.db');
}

/**
 * 确保数据库目录存在
 */
export function ensureDatabaseDirectory() {
  const dbPath = getDatabasePath();

  fs.mkdirSync(path.dirname(dbPath), {
    recursive: true,
  });

  return dbPath;
}
