import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ProviderModelId } from '@shared/api/provider';

/**
 * Provider 配置表：每行一个用户自建的供应商（无内置预置数据）。
 * - id 由 main 生成（uuid）；name 是用户输入
 * - 统一走 OpenAI API 格式，厂商差异通过 base_url 表达
 * - api_key 只存 safeStorage 加密后的密文（或 plain: 前缀的明文兜底），永远不落明文
 * - models 为 JSON 数组字符串；default_model 为 null 表示取列表第一个
 *
 * 表定义归属 provider 模块，经 infrastructure/database/schema.ts 汇总给
 * drizzle 实例（connection.ts）和 drizzle-kit（drizzle.config.ts）。
 */
export const providers = sqliteTable(
  'providers',
  {
    id: text('id').primaryKey(),

    name: text('name').notNull(),

    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),

    baseUrl: text('base_url'),

    apiKey: text('api_key'),

    /**
     * 模型列表（JSON 数组）。
     *
     * 结构：`ProviderModelId[]`，即纯字符串数组，元素没有子字段
     * 示例：["deepseek-chat", "deepseek-reasoner"]
     *
     * 落库形态（TEXT 列）：NULL 或 JSON 文本，
     * 例如 '["deepseek-chat","deepseek-reasoner"]'，未配置时为 NULL / '[]'
     *
     * - 每个元素就是调用 API 时传给 `model` 参数的 ID
     * - 顺序即 UI 中的展示顺序；去重由 service 保证
     * - null 或 [] 均表示尚未配置；读取时统一转为空数组
     *   （CHECK 保证非 null 时一定是 JSON 数组）
     * - drizzle 的 JSON mode 负责序列化/反序列化
     * - 若未来需要模型级元数据（显示名、上下文长度、能力开关等），
     *   应拆成独立的 provider_models 表，而不是把这里的元素改成对象
     */
    models: text('models', { mode: 'json' }).$type<ProviderModelId[]>(),

    /** 默认调用的模型 id；null 表示未选择默认模型 */
    defaultModel: text('default_model'),

    createdAt: integer('created_at').notNull(),

    updatedAt: integer('updated_at').notNull(),

    /**
     * 软删除时间戳；null 表示未删除。
     * 行保留在库里即可保留用户配置历史；列表与运行时都过滤掉已删除行。
     */
    deletedAt: integer('deleted_at'),
  },
  // DB 层兜底：models 必须是 JSON 数组（NULL 表示未配置，允许）
  (table) => [
    check(
      'providers_models_json',
      sql`${table.models} is null or (json_valid(${table.models}) and json_type(${table.models}) = 'array')`,
    ),
  ],
);

// 从数据库结构推导类型
export type ProviderRecord = typeof providers.$inferSelect;

export type NewProviderRecord = typeof providers.$inferInsert;
