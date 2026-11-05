import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Provider 配置表：每行一个用户自建的供应商（无内置预置数据）。
 * - id 由 main 生成（uuid）；name / type / region 是用户输入
 * - api_key 只存 safeStorage 加密后的密文（或 plain: 前缀的明文兜底），永远不落明文
 * - models 为 JSON 数组字符串；default_model 为 null 表示取列表第一个
 *
 * 表定义归属 provider 模块，经 infrastructure/database/schema.ts 汇总给
 * drizzle 实例（connection.ts）和 drizzle-kit（drizzle.config.ts）。
 */
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),

  name: text('name').notNull(),

  /** 接口协议：openai-compatible | anthropic | google（见 shared/api/provider） */
  type: text('type').notNull().default('openai-compatible'),

  /** 地区徽标：international | domestic */
  region: text('region').notNull().default('international'),

  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),

  baseUrl: text('base_url'),

  apiKey: text('api_key'),

  /** JSON 数组字符串，如 '["gpt-5.1"]'；null / '[]' 表示尚未配置模型 */
  models: text('models'),

  /** 默认调用的模型 id；null 表示取模型列表第一个 */
  defaultModel: text('default_model'),

  /** 模型调用参数（provider 级默认值） */
  temperature: real('temperature').notNull().default(0.7),

  maxOutputTokens: integer('max_output_tokens').notNull().default(4096),

  createdAt: integer('created_at').notNull(),

  updatedAt: integer('updated_at').notNull(),

  /**
   * 软删除时间戳；null 表示未删除。
   * 行保留在库里即可保留用户配置历史；列表与运行时都过滤掉已删除行。
   */
  deletedAt: integer('deleted_at'),
});

// 从数据库结构推导类型
export type ProviderRecord = typeof providers.$inferSelect;

export type NewProviderRecord = typeof providers.$inferInsert;
