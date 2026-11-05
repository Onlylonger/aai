/**
 * Provider 配置存储。
 *
 * - 配置保存在 userData/providers.json
 * - apiKey 使用 Electron safeStorage 加密（macOS 走 Keychain），文件里只存密文
 * - 只在 main 进程使用，renderer 永远拿不到明文 key
 *
 * 后续接入 SQLite 后可以迁移到 settings 表，对外接口保持不变。
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';

import {
  PROVIDER_IDS,
  PROVIDER_PRESETS,
  type ProviderConfigUpdate,
  type ProviderConfigView,
  type ProviderId,
} from '../../shared/provider';

interface StoredProvider {
  enabled: boolean;
  baseURL?: string;
  /** base64 密文；safeStorage 不可用时为明文（带前缀区分） */
  apiKey?: string;
  models: string[];
}

type StoredFile = Partial<Record<ProviderId, StoredProvider>>;

const PLAIN_PREFIX = 'plain:';

function filePath() {
  return path.join(app.getPath('userData'), 'providers.json');
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return PLAIN_PREFIX + value;
}

function decrypt(value: string): string {
  if (value.startsWith(PLAIN_PREFIX)) return value.slice(PLAIN_PREFIX.length);
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

let cache: StoredFile | null = null;

function load(): StoredFile {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(filePath(), 'utf-8')) as StoredFile;
  } catch {
    cache = {};
  }
  return cache;
}

function save(data: StoredFile) {
  cache = data;
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(data, null, 2), 'utf-8');
}

function resolve(id: ProviderId): StoredProvider {
  const preset = PROVIDER_PRESETS[id];
  const stored = load()[id];
  return {
    enabled: stored?.enabled ?? false,
    baseURL: stored?.baseURL || preset.defaultBaseURL,
    apiKey: stored?.apiKey,
    models: stored?.models?.length ? stored.models : preset.defaultModels,
  };
}

function toView(id: ProviderId): ProviderConfigView {
  const p = resolve(id);
  return {
    id,
    name: PROVIDER_PRESETS[id].name,
    enabled: p.enabled,
    baseURL: p.baseURL,
    hasApiKey: Boolean(p.apiKey),
    models: p.models,
  };
}

export const providerStore = {
  list(): ProviderConfigView[] {
    return PROVIDER_IDS.map(toView);
  },

  update(patch: ProviderConfigUpdate): ProviderConfigView {
    const data = { ...load() };
    const current = resolve(patch.id);
    const next: StoredProvider = {
      enabled: patch.enabled ?? current.enabled,
      baseURL: patch.baseURL !== undefined ? patch.baseURL.trim() : current.baseURL,
      apiKey: current.apiKey,
      models: patch.models ?? current.models,
    };
    if (patch.apiKey !== undefined) {
      next.apiKey = patch.apiKey ? encrypt(patch.apiKey.trim()) : undefined;
    }
    data[patch.id] = next;
    save(data);
    return toView(patch.id);
  },

  /** 仅供 main 内部（providerRegistry）使用，返回解密后的配置 */
  getRuntimeConfig(id: ProviderId) {
    const p = resolve(id);
    return {
      enabled: p.enabled,
      baseURL: p.baseURL || undefined,
      apiKey: p.apiKey ? decrypt(p.apiKey) : undefined,
    };
  },
};
