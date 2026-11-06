/**
 * Provider（模型供应商）的共享类型与 IPC 契约。
 *
 * Provider 完全由用户在界面里创建（无内置预置数据）：
 * - id 由 main 生成（uuid）；name 是用户输入
 * - 统一使用 OpenAI 兼容协议，厂商差异通过 baseUrl 表达
 * - api_key 密文永不离开 main 进程，renderer 只拿到 hasApiKey
 * - models 在 main 侧解析为 string[]；defaultModel 为 null 表示未选择
 *
 * zod schema 定义在这里（zod 是纯 JS，双进程都能用），作为 IPC 边界的运行期校验与
 * 类型的单一来源：renderer 表单用它做 UX 校验，main 在 handle() 入口用它校验
 * 不可信的 IPC payload（TS 类型运行期不存在，renderer 是不可信侧）。
 *
 * 这里不能 import electron / node 模块。
 */
import { z } from 'zod';

/** provider 行 id：main 生成的 uuid（历史开发库里可能存在旧字面量 id，一律按字符串处理） */
export type ProviderId = string;

/** provider id 入参的运行期校验（IPC 边界用） */
export const providerIdSchema = z.string().min(1);

/**
 * 单个模型 ID。
 * 就是调用 API 时传给 `model` 参数的字符串（如 "deepseek-chat"），
 * 当前不携带显示名、上下文长度等元数据。
 */
export type ProviderModelId = string;

/** 模型引用：provider + model，作为一次请求「用哪个模型」的唯一标识 */
export interface ModelRef {
  providerId: ProviderId;
  modelId: string;
}

/** renderer 看到的 provider 配置视图 */
export interface ProviderView {
  id: ProviderId;

  name: string;

  enabled: boolean;

  /** OpenAI 兼容端点的 base URL；null 表示使用 OpenAI 官方地址 */
  baseUrl: string | null;

  /** 是否已配置 API Key（密文不出 main 进程） */
  hasApiKey: boolean;

  /** 模型 ID 列表（已解析），可能为空数组 */
  models: ProviderModelId[];

  /** 默认调用的模型 id；null 表示未选择 */
  defaultModel: string | null;

  createdAt: number;

  updatedAt: number;
}

/**
 * renderer 更新 provider 时提交的数据（PATCH 语义，id 定位行）：
 * - apiKey：undefined 表示不修改；'' 表示清除
 * - baseUrl：null / 空串表示恢复官方默认地址
 * - models：空数组表示清空模型列表
 * - defaultModel：null 表示清空；其他值按传入值存储
 */
export const providerUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  baseUrl: z
    .string()
    .refine((v) => v === '' || /^https?:\/\//.test(v), '请输入合法的 URL')
    .nullable()
    .optional(),
  apiKey: z.string().max(4096).optional(),
  models: z.array(z.string().min(1, '模型 ID 不能为空')).max(200).optional(),
  defaultModel: z.string().min(1).nullable().optional(),
});

export type ProviderUpdate = z.infer<typeof providerUpdateSchema>;

/**
 * renderer 新建 provider 时提交的数据。
 * 与 update 共用字段校验；name 必填，其余配置可在创建时一并提交（复用同一抽屉）。
 */
export const providerCreateSchema = providerUpdateSchema
  .omit({ id: true })
  .extend({
    name: z.string().trim().min(1, '请输入名称').max(100, '名称过长'),
  });

export type ProviderCreate = z.infer<typeof providerCreateSchema>;

// 编译期防漂移已由 z.infer 保证：类型与 schema 同源，不会再各自漂移

/** Provider 模块的 IPC channel */
export const PROVIDER_CHANNELS = {
  list: 'provider:list',
  create: 'provider:create',
  update: 'provider:update',
  delete: 'provider:delete',
  test: 'provider:test',
} as const;

/** Provider 模块的 IPC 契约：channel → [参数, 返回值] */
export interface ProviderIpcContract {
  [PROVIDER_CHANNELS.list]: [void, ProviderView[]];
  [PROVIDER_CHANNELS.create]: [ProviderCreate, ProviderView];
  [PROVIDER_CHANNELS.update]: [ProviderUpdate, ProviderView];
  [PROVIDER_CHANNELS.delete]: [ProviderId, void];
  [PROVIDER_CHANNELS.test]: [ProviderId, void];
}
