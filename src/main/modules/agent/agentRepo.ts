/**
 * Agent 模块的数据访问层（SQLite + drizzle）。
 *
 * 只做数据库读写与行 → 视图映射；对外通过 agentService 使用。
 */
import { randomUUID } from 'node:crypto';

import { asc, eq, inArray, sql } from 'drizzle-orm';

import type {
  AgentRunStatus,
  AgentRunView,
  AgentStepStatus,
  AgentStepType,
  AgentStepView,
} from '@shared/api/agent';
import { getDb } from '@main/infrastructure/database/connection';

import { agentRuns } from './agentRunTable';
import type { AgentRunRecord, NewAgentRunRecord } from './agentRunTable';
import { agentSteps } from './agentStepTable';
import type { AgentStepRecord, NewAgentStepRecord } from './agentStepTable';

/* ------------------------------------------------------------------ */
/* 行 → 视图                                                           */
/* ------------------------------------------------------------------ */

function toRunStatus(value: string): AgentRunStatus {
  switch (value) {
    case 'pending':
    case 'running':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return value;
    default:
      return 'pending';
  }
}

function toStepType(value: string): AgentStepType {
  switch (value) {
    case 'plan':
    case 'llm':
    case 'tool':
    case 'approval':
    case 'note':
      return value;
    default:
      return 'note';
  }
}

function toStepStatus(value: string): AgentStepStatus {
  switch (value) {
    case 'pending':
    case 'running':
    case 'done':
    case 'error':
    case 'cancelled':
      return value;
    default:
      return 'pending';
  }
}

function toStepView(row: AgentStepRecord): AgentStepView {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    type: toStepType(row.type),
    title: row.title,
    toolName: row.toolName ?? undefined,
    input: row.input ?? undefined,
    output: row.output ?? undefined,
    status: toStepStatus(row.status),
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? undefined,
  };
}

function toRunView(row: AgentRunRecord, steps: AgentStepView[]): AgentRunView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    status: toRunStatus(row.status),
    plan: row.plan ?? undefined,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    steps,
    createdAt: row.createdAt,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Repo                                                                */
/* ------------------------------------------------------------------ */

export const agentRepo = {
  createRun(input: {
    /** 与事件里的 runId 保持一致 */
    id: string;
    conversationId: string;
    messageId: string;
    plan?: string;
  }): AgentRunView {
    const now = Date.now();
    const row = getDb()
      .insert(agentRuns)
      .values({
        id: input.id,
        conversationId: input.conversationId,
        messageId: input.messageId,
        status: 'running',
        plan: input.plan ?? null,
        startedAt: now,
        createdAt: now,
      })
      .returning()
      .get();

    return toRunView(row, []);
  },

  updateRun(
    id: string,
    patch: {
      status?: AgentRunStatus;
      plan?: string;
      result?: string;
      error?: string;
      completedAt?: number;
    },
  ): void {
    const values: Partial<NewAgentRunRecord> = {};

    if (patch.status !== undefined) values.status = patch.status;
    if (patch.plan !== undefined) values.plan = patch.plan;
    if (patch.result !== undefined) values.result = patch.result;
    if (patch.error !== undefined) values.error = patch.error;
    if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;

    getDb().update(agentRuns).set(values).where(eq(agentRuns.id, id)).run();
  },

  /** seq 在事务内分配，避免并发步骤得到相同序号 */
  addStep(input: {
    runId: string;
    type: AgentStepType;
    title: string;
    status?: AgentStepStatus;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
  }): AgentStepView {
    const now = Date.now();

    const row = getDb().transaction((tx) => {
      const last = tx
        .select({
          seq: sql<number>`coalesce(max(${agentSteps.seq}), 0)`,
        })
        .from(agentSteps)
        .where(eq(agentSteps.runId, input.runId))
        .get();

      return tx
        .insert(agentSteps)
        .values({
          id: randomUUID(),
          runId: input.runId,
          seq: (last?.seq ?? 0) + 1,
          type: input.type,
          title: input.title,
          toolName: input.toolName ?? null,
          input: input.input === undefined ? null : input.input,
          output: input.output === undefined ? null : input.output,
          status: input.status ?? 'running',
          error: input.error ?? null,
          createdAt: now,
          completedAt: input.status === 'done' ? now : null,
        })
        .returning()
        .get();
    });

    return toStepView(row);
  },

  updateStep(
    id: string,
    patch: {
      status?: AgentStepStatus;
      output?: unknown;
      error?: string;
      completedAt?: number;
    },
  ): AgentStepView | null {
    const values: Partial<NewAgentStepRecord> = {};

    if (patch.status !== undefined) values.status = patch.status;
    if (patch.output !== undefined) values.output = patch.output;
    if (patch.error !== undefined) values.error = patch.error;
    if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;

    const row = getDb()
      .update(agentSteps)
      .set(values)
      .where(eq(agentSteps.id, id))
      .returning()
      .get();

    return row ? toStepView(row) : null;
  },

  listRuns(conversationId: string): AgentRunView[] {
    const db = getDb();
    const runRows = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.conversationId, conversationId))
      .orderBy(asc(agentRuns.createdAt))
      .all();

    if (runRows.length === 0) return [];

    const stepRows = db
      .select()
      .from(agentSteps)
      .where(
        inArray(
          agentSteps.runId,
          runRows.map((run) => run.id),
        ),
      )
      .orderBy(asc(agentSteps.seq))
      .all();

    const stepsByRun = new Map<string, AgentStepView[]>();
    for (const row of stepRows) {
      const list = stepsByRun.get(row.runId) ?? [];
      list.push(toStepView(row));
      stepsByRun.set(row.runId, list);
    }

    return runRows.map((run) => toRunView(run, stepsByRun.get(run.id) ?? []));
  },
};
