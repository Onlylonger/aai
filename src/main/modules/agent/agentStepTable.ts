import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { agentRuns } from './agentRunTable';

/**
 * Agent 执行步骤：规划、LLM 调用、工具调用、审批、备注。
 * 中间过程不写入 messages，避免污染普通聊天消息流。
 */
export const agentSteps = sqliteTable(
  'agent_steps',
  {
    id: text('id').primaryKey(),

    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),

    /** run 内递增序号 */
    seq: integer('seq').notNull(),

    /** plan | llm | tool | approval | note */
    type: text('type').notNull(),

    /** 展示标题，如「任务规划」「调用模型」 */
    title: text('title').notNull(),

    toolName: text('tool_name'),

    /** JSON：步骤输入 / 工具入参 */
    input: text('input', { mode: 'json' }).$type<unknown>(),

    /** JSON：步骤输出 / 工具结果 */
    output: text('output', { mode: 'json' }).$type<unknown>(),

    /** pending | running | done | error | cancelled */
    status: text('status').notNull().default('pending'),

    error: text('error'),

    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (table) => [
    uniqueIndex('agent_steps_run_seq_idx').on(table.runId, table.seq),
  ],
);

export type AgentStepRecord = typeof agentSteps.$inferSelect;
export type NewAgentStepRecord = typeof agentSteps.$inferInsert;
