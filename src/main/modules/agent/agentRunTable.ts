import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { conversations } from '../conversation/conversationTable';
import { messages } from '../conversation/messageTable';

/**
 * Agent 执行实例。
 * 一个会话可以有多个 run；最终回答挂在 message_id 指向的 assistant 消息上。
 */
export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: text('id').primaryKey(),

    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),

    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),

    /** pending | running | completed | failed | cancelled */
    status: text('status').notNull().default('pending'),

    plan: text('plan'),
    result: text('result'),
    error: text('error'),

    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('agent_runs_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export type AgentRunRecord = typeof agentRuns.$inferSelect;
export type NewAgentRunRecord = typeof agentRuns.$inferInsert;
