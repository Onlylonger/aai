import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * 会话表：Chat 与 Agent 共用的容器，不区分模式。
 * last_mode / last_model 只用于输入框默认值；
 * 实际使用的模式记录在 messages.mode 上。
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),

    title: text('title').notNull(),

    /** 上次使用的模式（仅默认值）：chat | agent */
    lastMode: text('last_mode').notNull().default('chat'),

    /** 上次使用的模型（仅默认值） */
    lastModelProviderId: text('last_model_provider_id'),
    lastModelId: text('last_model_id'),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('conversations_updated_at_idx').on(table.updatedAt)],
);

export type ConversationRecord = typeof conversations.$inferSelect;
export type NewConversationRecord = typeof conversations.$inferInsert;
