/**
 * Agent（任务执行）相关的共享类型与 IPC 契约。
 *
 * 一次 Agent 执行 = 一条 AgentRun + N 条 AgentStep；
 * 最终回答仍写入 messages（mode = 'agent'），中间步骤只存在于 agent_steps。
 */
import { z } from 'zod';

export const agentRunStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const agentStepTypeSchema = z.enum([
  'plan',
  'llm',
  'tool',
  'approval',
  'note',
]);

export type AgentStepType = z.infer<typeof agentStepTypeSchema>;

export const agentStepStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'error',
  'cancelled',
]);

export type AgentStepStatus = z.infer<typeof agentStepStatusSchema>;

/** renderer 看到的单个执行步骤 */
export interface AgentStepView {
  id: string;
  runId: string;
  seq: number;
  type: AgentStepType;
  /** 展示标题，如「任务规划」「调用模型」 */
  title: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  status: AgentStepStatus;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

/** renderer 看到的一次 Agent 执行 */
export interface AgentRunView {
  id: string;
  conversationId: string;
  /** 最终回答挂载的 assistant 消息 */
  messageId: string;
  status: AgentRunStatus;
  plan?: string;
  result?: string;
  error?: string;
  steps: AgentStepView[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

/** Agent 模块的 IPC channel */
export const AGENT_CHANNELS = {
  /** 按会话查询历史 run（打开会话时与消息一起加载） */
  runs: 'agent:runs',
} as const;

/** agent:runs 的入参校验 */
export const agentRunsQuerySchema = z.object({
  conversationId: z.string().min(1),
});

/** Agent 模块的 IPC 契约 */
export interface AgentIpcContract {
  [AGENT_CHANNELS.runs]: [{ conversationId: string }, AgentRunView[]];
}
