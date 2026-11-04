import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { conversations } from './conversationTable';

/**
 * 消息表：用户消息与 assistant 最终回复。
 *
 * Agent 的中间执行步骤不写这里，写 agent_steps（P1）。
 * seq 为会话内单调递增序号，排序不依赖 created_at（user / assistant 可能同毫秒）。
 */
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),

    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    /** 会话内递增序号，用于稳定排序 */
    seq: integer('seq').notNull(),

    /** user | assistant | system */
    role: text('role').notNull(),

    content: text('content').notNull().default(''),

    reasoning: text('reasoning'),

    /** streaming | done | error | aborted */
    status: text('status').notNull(),

    /** 产生该消息时的模式：chat | agent */
    mode: text('mode').notNull().default('chat'),

    error: text('error'),

    modelProviderId: text('model_provider_id'),
    modelId: text('model_id'),

    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('messages_conversation_seq_idx').on(
      table.conversationId,
      table.seq,
    ),
  ],
);

export type MessageRecord = typeof messages.$inferSelect;
export type NewMessageRecord = typeof messages.$inferInsert;
