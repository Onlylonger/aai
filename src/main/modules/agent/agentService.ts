/**
 * Agent 模块的业务入口。
 *
 * ChatService / AgentRuntime 之外的模块只通过它读写 Agent 执行记录。
 */
import type {
  AgentRunStatus,
  AgentRunView,
  AgentStepStatus,
  AgentStepType,
  AgentStepView,
} from '@shared/api/agent';

import { agentRepo } from './agentRepo';

export const agentService = {
  createRun(input: {
    id: string;
    conversationId: string;
    messageId: string;
    plan?: string;
  }): AgentRunView {
    return agentRepo.createRun(input);
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
    agentRepo.updateRun(id, patch);
  },

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
    return agentRepo.addStep(input);
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
    return agentRepo.updateStep(id, patch);
  },

  listRuns(conversationId: string): AgentRunView[] {
    return agentRepo.listRuns(conversationId);
  },
};
