/**
 * Agent 工具的 workspace 边界与通用限制。
 *
 * P2 只提供只读工具：所有路径都必须落在 workspace 根目录内，
 * 并跳过目录 / 大文件 / 二进制文件，避免一次任务扫描整块磁盘。
 */
import path from 'node:path';

/** 可通过 AAI_AGENT_WORKSPACE 指定；默认当前进程工作目录（开发时即项目根目录） */
export const WORKSPACE_ROOT = path.resolve(
  process.env.AAI_AGENT_WORKSPACE ?? process.cwd(),
);

/** 递归时跳过的目录 */
export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'release',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.erb',
]);

/** 常见二进制扩展名（按扩展名直接跳过搜索） */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.mp4',
  '.mp3',
  '.wav',
  '.webm',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.wasm',
  '.node',
  '.dll',
  '.so',
  '.dylib',
  '.exe',
  '.db',
  '.sqlite',
]);

export const MAX_LIST_ENTRIES = 200;
export const MAX_LIST_DEPTH = 3;

export const MAX_READ_BYTES = 64 * 1024;
export const MAX_SEARCH_FILE_BYTES = 256 * 1024;
export const MAX_SEARCH_FILES = 2000;
export const MAX_SEARCH_RESULTS = 50;

export function isBinaryExtension(fileName: string): boolean {
  return BINARY_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

/**
 * 把工具入参的相对路径解析到 workspace 内。
 * 绝对路径、../ 越界一律拒绝。
 */
export function resolveWorkspacePath(input?: string): string {
  const relative = input?.trim() || '.';
  const resolved = path.resolve(WORKSPACE_ROOT, relative);

  if (
    resolved !== WORKSPACE_ROOT &&
    !resolved.startsWith(WORKSPACE_ROOT + path.sep)
  ) {
    throw new Error(`Path escapes workspace: ${relative}`);
  }

  return resolved;
}

/** 返回相对 workspace 的展示路径 */
export function toWorkspaceRelative(absolutePath: string): string {
  return path.relative(WORKSPACE_ROOT, absolutePath) || '.';
}
