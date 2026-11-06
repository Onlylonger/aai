/**
 * Provider 配置的读写入口，IPC（providerIpc）和 main 内部（providerRegistry）都从这里取数。
 *
 * - Provider 完全由用户创建（无内置预置），配置落在 SQLite（providers 表）
 * - 统一走 OpenAI 兼容协议，厂商差异通过 baseUrl 表达
 * - apiKey 用 safeStorage 加密后入库；renderer 拿到的 ProviderView 只带 hasApiKey，
 *   密文和明文永远不出 main 进程
 */
import { randomUUID } from 'node:crypto';

import type {
  ProviderCreate,
  ProviderId,
  ProviderUpdate,
  ProviderView,
} from '@shared/api/provider';
import {
  decryptSecret,
  encryptSecret,
} from '@main/infrastructure/security/secretStorage';

import { providerRepo } from './providerRepo';
import type { ProviderRecord } from './providerTable';

/* ------------------------------------------------------------------ */
/* 行数据解析                                                          */
/* ------------------------------------------------------------------ */

/** 读取仍有效的行；不存在或已软删除一律视为未找到 */
function requireActive(id: ProviderId): ProviderRecord {
  const row = providerRepo.findById(id);

  if (!row || row.deletedAt != null) {
    throw new Error(`Provider not found: ${id}`);
  }

  return row;
}

/** DB 行 → renderer 视图：隐藏 apiKey */
function toView(row: ProviderRecord): ProviderView {
  const models = row.models ?? [];

  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    hasApiKey: row.apiKey !== null,
    models,
    defaultModel: row.defaultModel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* PATCH 字段解析（undefined = 保留；空值 = 恢复默认/清除）             */
/* ------------------------------------------------------------------ */

async function resolveApiKey(
  patch: string | undefined,
  current: string | null,
): Promise<string | null> {
  if (patch === undefined) return current;

  const value = patch.trim();
  return value ? encryptSecret(value) : null;
}

function resolveBaseUrl(
  patch: string | null | undefined,
  current: string | null,
): string | null {
  if (patch === undefined) return current;
  if (patch === null) return null;
  return patch.trim() || null;
}

/* ------------------------------------------------------------------ */
/* 公共 API                                                            */
/* ------------------------------------------------------------------ */

/**
 * provider 的运行期配置（密钥已解密），供 llm 适配层等 main 内部模块消费。
 * 不包含渲染层字段（如 hasApiKey），也不应该被传出 main 进程。
 */
export interface ProviderRuntimeConfig {
  enabled: boolean;
  name: string;
  baseURL?: string;
  apiKey?: string;
  /** 默认模型；未设置时为模型列表第一个，列表为空则为 undefined */
  modelId?: string;
}

export const providerService = {
  async list(): Promise<ProviderView[]> {
    return providerRepo.findAll().map(toView);
  },

  /** 新建 provider：id 由 main 生成；可选配置与 update 语义一致，可一次性提交 */
  async create(input: ProviderCreate): Promise<ProviderView> {
    const now = Date.now();
    const models = input.models === undefined ? [] : [...new Set(input.models)];

    const row = providerRepo.insert({
      id: randomUUID(),
      name: input.name.trim(),
      enabled: input.enabled ?? false,
      baseUrl: resolveBaseUrl(input.baseUrl, null),
      apiKey: await resolveApiKey(input.apiKey, null),
      models: input.models === undefined ? null : models,
      defaultModel: input.defaultModel ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return toView(row);
  },

  /**
   * PATCH 语义：undefined 的字段不修改；baseUrl 传 null / 空串表示恢复官方默认地址；
   * apiKey 传 '' 表示清除，传新值则加密入库；defaultModel 不在最终模型列表内时忽略。
   */
  async update(patch: ProviderUpdate): Promise<ProviderView> {
    const row = requireActive(patch.id);

    // 模型 ID 去重（IPC 边界不保证唯一性），后续 defaultModel 校验基于最终列表
    const nextModels =
      patch.models === undefined
        ? (row.models ?? [])
        : [...new Set(patch.models)];

    const nextDefaultModel =
      patch.defaultModel !== undefined ? patch.defaultModel : row.defaultModel;

    const next = providerRepo.update(patch.id, {
      name: patch.name !== undefined ? patch.name : row.name,
      enabled: patch.enabled ?? row.enabled,
      baseUrl: resolveBaseUrl(patch.baseUrl, row.baseUrl),
      apiKey: await resolveApiKey(patch.apiKey, row.apiKey),
      models: patch.models === undefined ? row.models : nextModels,
      defaultModel: nextDefaultModel,
      updatedAt: Date.now(),
    });

    if (!next) {
      throw new Error(`Provider row missing after update: ${patch.id}`);
    }

    return toView(next);
  },

  /** 软删除：行保留在库里（保留用户配置历史），列表与运行时都不再可见 */
  async delete(id: ProviderId): Promise<void> {
    requireActive(id);
    providerRepo.softDelete(id);
  },

  /** 供本模块的 providerRegistry / providerTest 获取解密后的运行配置 */
  async getRuntimeConfig(id: ProviderId): Promise<ProviderRuntimeConfig> {
    const row = requireActive(id);

    return {
      enabled: row.enabled,
      name: row.name,
      baseURL: row.baseUrl || undefined,
      apiKey: row.apiKey ? await decryptSecret(row.apiKey) : undefined,
      modelId: row.defaultModel ?? undefined,
    };
  },
};
