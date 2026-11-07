/**
 * Agent 模块的 IPC 注册。
 */
import { AGENT_CHANNELS, agentRunsQuerySchema } from '@shared/api/agent';
import { handleValidated } from '@main/infrastructure/ipc';

import { agentService } from './agentService';

export function registerAgentIpc() {
  handleValidated(
    AGENT_CHANNELS.runs,
    agentRunsQuerySchema,
    ({ conversationId }) => agentService.listRuns(conversationId),
  );
}
