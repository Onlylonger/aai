/**
 * 敏感字符串的安全存储工具（main 进程专用）。
 *
 * 任何需要把密钥 / token 落库的模块都从这里取，不要在业务模块里各写一份。
 * - 使用 Electron safeStorage 的异步 API（同步版自 Electron 45 起已废弃）
 * - 异步加密不可用时退化为 `plain:` 前缀的明文兜底（读取时原样返回）
 * - 密文以 base64 字符串存储，适合放进 TEXT 列
 */
import { safeStorage } from 'electron';

/** 明文兜底前缀；带此前缀的值不经过 safeStorage */
export const PLAIN_PREFIX = 'plain:';

/** 加密为可入库的字符串（base64 密文，或 plain: 前缀明文） */
export async function encryptSecret(value: string): Promise<string> {
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    const encrypted = await safeStorage.encryptStringAsync(value);
    return encrypted.toString('base64');
  }
  return PLAIN_PREFIX + value;
}

/**
 * 解密数据库中的字符串（plain: 前缀直接返回）。
 *
 * shouldReEncrypt 表示系统密钥发生轮换；按 Electron 文档在此时再解密一次，
 * 拿到用新密钥加密后的字符串。
 */
export async function decryptSecret(value: string): Promise<string> {
  if (value.startsWith(PLAIN_PREFIX)) return value.slice(PLAIN_PREFIX.length);

  const encrypted = Buffer.from(value, 'base64');
  const first = await safeStorage.decryptStringAsync(encrypted);

  if (!first.shouldReEncrypt) return first.result;

  const second = await safeStorage.decryptStringAsync(encrypted);
  return second.result;
}
