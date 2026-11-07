/**
 * AgentRuntime（P2）：带只读工具的多步执行。
 *
 * 一次执行 = 规划步骤 +（模型步 / 工具调用步）* + 最终回答。
 * AI SDK 负责「LLM → tool → observe → LLM」循环，本模块负责：
 * - 把过程写入 agent_steps
 * - 把 RunEvent 推给 renderer
 */
import type { ModelMessage } from 'ai';
import log from 'electron-log';

import type { AgentStepStatus, AgentStepView } from '@shared/api/agent';
import type {
  ChatMessage,
  RunEvent,
  SendMessageRequest,
  SendMessageResponse,
} from '@shared/chat';
import type { ChatRunContext, RunEventPayload } from '../chat/chatService';
import { toModelMessages } from '../chat/messageHistory';
import { errorMessage } from '../chat/streamAssistant';
import { conversationService } from '../conversation/conversationService';

import { agentService } from './agentService';
import { streamAgent, type AgentStreamHandlers } from './agentStream';
import { WORKSPACE_ROOT } from './tools/workspace';

const SYSTEM_PROMPT = `You are an AI agent working inside a local workspace.
Workspace root: ${WORKSPACE_ROOT}
Paths passed to tools are relative to the workspace root.
Use the provided read-only tools when you need to inspect files.
Do not fabricate file contents. When you have enough information, answer the user directly and concisely.`;

const PLAN = '按需调用只读工具（列目录 / 读文件 / 搜索），然后汇总回答';

async function execute(opts: {
  req: SendMessageRequest;
  messages: ModelMessage[];
  assistantMessage: ChatMessage;
  runId: string;
  signal: AbortSignal;
  emit: (payload: RunEventPayload) => void;
}) {
  const { req, messages, assistantMessage, runId, signal, emit } = opts;

  // 未结束的 step（异常 / 取消时统一收尾）
  const openSteps = new Set<string>();
  const llmSteps = new Map<number, string>();
  const toolSteps = new Map<string, string>();

  const startStep = (input: {
    type: AgentStepView['type'];
    title: string;
    toolName?: string;
    input?: unknown;
  }): AgentStepView => {
    const step = agentService.addStep({
      runId,
      type: input.type,
      title: input.title,
      toolName: input.toolName,
      input: input.input,
      status: 'running',
    });
    openSteps.add(step.id);
    emit({ type: 'step-start', step });
    return step;
  };

  const finishStep = (
    stepId: string,
    status: AgentStepStatus,
    patch: { output?: unknown; error?: string } = {},
  ) => {
    const step = agentService.updateStep(stepId, {
      status,
      output: patch.output,
      error: patch.error,
      completedAt: Date.now(),
    });
    openSteps.delete(stepId);
    emit({
      type: 'step-finish',
      stepId,
      status,
      output: patch.output,
      error: patch.error,
    });
    return step;
  };

  /** 异常 / 取消时，把仍未结束的步骤统一收尾 */
  const closeOpenSteps = (status: AgentStepStatus, error?: string) => {
    for (const stepId of [...openSteps]) {
      finishStep(stepId, status, error ? { error } : {});
    }
  };

  const handlers: AgentStreamHandlers = {
    onTextDelta: (delta) => emit({ type: 'text-delta', delta }),
    onReasoningDelta: (delta) => emit({ type: 'reasoning-delta', delta }),

    onStepStart: (stepNumber) => {
      const step = startStep({
        type: 'llm',
        title: `模型调用（第 ${stepNumber} 步）`,
      });
      llmSteps.set(stepNumber, step.id);
    },

    onStepFinish: (stepNumber, finishReason) => {
      const stepId = llmSteps.get(stepNumber);
      if (stepId) {
        finishStep(stepId, 'done', { output: { finishReason } });
      }
    },

    onToolCall: ({ toolCallId, toolName, input }) => {
      const step = startStep({
        type: 'tool',
        title: `调用工具 ${toolName}`,
        toolName,
        input,
      });
      toolSteps.set(toolCallId, step.id);
    },

    onToolResult: ({ toolCallId, output }) => {
      const stepId = toolSteps.get(toolCallId);
      if (stepId) {
        finishStep(stepId, 'done', { output });
      }
    },

    onToolError: ({ toolCallId, error }) => {
      const stepId = toolSteps.get(toolCallId);
      if (stepId) {
        finishStep(stepId, 'error', { error });
      }
    },
  };

  try {
    emit({ type: 'run-start', mode: 'agent', model: req.model });

    // 1) 规划步骤
    const planStep = startStep({
      type: 'plan',
      title: '任务规划',
      input: { goal: req.text },
    });
    finishStep(planStep.id, 'done', { output: { plan: PLAN } });
    emit({ type: 'agent-plan', plan: PLAN });

    // 2) 多步执行（模型 + 工具）
    const outcome = await streamAgent({
      model: req.model,
      instructions: SYSTEM_PROMPT,
      messages,
      signal,
      handlers,
    });

    closeOpenSteps('done');

    if (outcome.type === 'finish') {
      conversationService.updateMessage(assistantMessage.id, {
        text: outcome.text,
        reasoning: outcome.reasoning || undefined,
        status: 'done',
      });

      agentService.updateRun(runId, {
        status: 'completed',
        result: outcome.text,
        completedAt: Date.now(),
      });
      emit({
        type: 'run-finish',
        finishReason: outcome.finishReason,
        usage: outcome.usage,
      });
      return;
    }

    if (outcome.type === 'error') {
      log.error('[agent] run failed', outcome.error);
      closeOpenSteps('error', outcome.error);
      conversationService.updateMessage(assistantMessage.id, {
        text: outcome.text,
        reasoning: outcome.reasoning || undefined,
        status: 'error',
        error: outcome.error,
      });
      agentService.updateRun(runId, {
        status: 'failed',
        error: outcome.error,
        completedAt: Date.now(),
      });
      emit({ type: 'run-error', error: outcome.error });
      return;
    }

    closeOpenSteps('cancelled');
    conversationService.updateMessage(assistantMessage.id, {
      text: outcome.text,
      reasoning: outcome.reasoning || undefined,
      status: 'aborted',
    });
    agentService.updateRun(runId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });
    emit({ type: 'run-abort' });
  } catch (error) {
    const message = errorMessage(error);
    log.error('[agent] run crashed', message);
    closeOpenSteps('error', message);
    conversationService.updateMessage(assistantMessage.id, {
      status: 'error',
      error: message,
    });
    agentService.updateRun(runId, {
      status: 'failed',
      error: message,
      completedAt: Date.now(),
    });
    emit({ type: 'run-error', error: message });
  }
}

export const agentRuntime = {
  /**
   * 执行一次 Agent。runId / signal / emit 由 RuntimeManager 提供；
   * 最终回答仍然是 assistant 消息，中间过程写入 agent_steps。
   */
  send(req: SendMessageRequest, context: ChatRunContext): SendMessageResponse {
    const { runId, signal, emit } = context;
    const text = req.text.trim();
    if (!text) throw new Error('消息不能为空');

    const conversation =
      (req.conversationId &&
        conversationService.getConversation(req.conversationId)) ||
      conversationService.createConversation({
        title: text.slice(0, 30),
        lastMode: 'agent',
      });

    // 历史消息要在写入新消息之前取出
    const history = conversationService.listMessages(conversation.id);

    const userMessage = conversationService.addMessage({
      conversationId: conversation.id,
      role: 'user',
      text,
      status: 'done',
      mode: 'agent',
    });
    const assistantMessage = conversationService.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '',
      status: 'streaming',
      mode: 'agent',
      model: req.model,
    });
    conversationService.touchConversation(conversation.id, {
      lastMode: 'agent',
      lastModel: req.model,
    });

    agentService.createRun({
      id: runId,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      plan: PLAN,
    });

    const emitEvent = (payload: RunEventPayload) =>
      emit({
        ...payload,
        runId,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        ts: Date.now(),
      } as RunEvent);

    // 不 await：让 IPC 先返回，执行过程通过事件推送
    void execute({
      req,
      messages: [...toModelMessages(history), { role: 'user', content: text }],
      assistantMessage,
      runId,
      signal,
      emit: emitEvent,
    });

    return {
      conversationId: conversation.id,
      runId,
      userMessage: { ...userMessage },
      assistantMessage: { ...assistantMessage },
    };
  },
};
