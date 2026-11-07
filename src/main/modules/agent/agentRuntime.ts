/**
 * AgentRuntime（P1 骨架）：一次 Agent 执行 = 规划步骤 + 一次模型调用。
 *
 * P1 暂未接入真实工具；先把「run / step 记录 + 事件协议 + 渲染」链路跑通。
 * 后续 P2 会在这里替换成「规划 → 工具 → 观察 → LLM → ...」的多步循环。
 */
import type { ModelMessage } from 'ai';
import log from 'electron-log';

import type {
  ChatMessage,
  RunEvent,
  SendMessageRequest,
  SendMessageResponse,
} from '@shared/chat';
import type { ChatRunContext, RunEventPayload } from '../chat/chatService';
import { toModelMessages } from '../chat/messageHistory';
import { errorMessage, streamAssistant } from '../chat/streamAssistant';
import { conversationService } from '../conversation/conversationService';

import { agentService } from './agentService';

const SYSTEM_PROMPT =
  'You are a helpful assistant. Answer the user request directly and clearly.';

/** P1 的固定计划；P2 接入规划模型后替换为动态计划 */
const P1_PLAN = '直接调用模型回答（P1 阶段暂未接入工具）';

async function execute(opts: {
  req: SendMessageRequest;
  messages: ModelMessage[];
  assistantMessage: ChatMessage;
  runId: string;
  signal: AbortSignal;
  emit: (payload: RunEventPayload) => void;
}) {
  const { req, messages, assistantMessage, runId, signal, emit } = opts;

  try {
    emit({ type: 'run-start', mode: 'agent', model: req.model });

    // 1) 规划步骤
    const planStep = agentService.addStep({
      runId,
      type: 'plan',
      title: '任务规划',
      status: 'running',
      input: { goal: req.text },
    });
    emit({ type: 'step-start', step: planStep });

    agentService.updateStep(planStep.id, {
      status: 'done',
      output: { plan: P1_PLAN },
      completedAt: Date.now(),
    });
    emit({
      type: 'step-finish',
      stepId: planStep.id,
      status: 'done',
      output: { plan: P1_PLAN },
    });
    emit({ type: 'agent-plan', plan: P1_PLAN });

    // 2) 模型调用步骤
    const llmStep = agentService.addStep({
      runId,
      type: 'llm',
      title: '调用模型',
      status: 'running',
    });
    emit({ type: 'step-start', step: llmStep });

    const outcome = await streamAssistant({
      model: req.model,
      instructions: SYSTEM_PROMPT,
      messages,
      signal,
      onTextDelta: (delta) => emit({ type: 'text-delta', delta }),
      onReasoningDelta: (delta) => emit({ type: 'reasoning-delta', delta }),
    });

    if (outcome.type === 'finish') {
      conversationService.updateMessage(assistantMessage.id, {
        text: outcome.text,
        reasoning: outcome.reasoning || undefined,
        status: 'done',
      });

      const output = {
        finishReason: outcome.finishReason,
        usage: outcome.usage,
      };
      agentService.updateStep(llmStep.id, {
        status: 'done',
        output,
        completedAt: Date.now(),
      });
      emit({ type: 'step-finish', stepId: llmStep.id, status: 'done', output });

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
      conversationService.updateMessage(assistantMessage.id, {
        text: outcome.text,
        reasoning: outcome.reasoning || undefined,
        status: 'error',
        error: outcome.error,
      });
      agentService.updateStep(llmStep.id, {
        status: 'error',
        error: outcome.error,
        completedAt: Date.now(),
      });
      emit({
        type: 'step-finish',
        stepId: llmStep.id,
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

    conversationService.updateMessage(assistantMessage.id, {
      text: outcome.text,
      reasoning: outcome.reasoning || undefined,
      status: 'aborted',
    });
    agentService.updateStep(llmStep.id, {
      status: 'cancelled',
      completedAt: Date.now(),
    });
    emit({ type: 'step-finish', stepId: llmStep.id, status: 'cancelled' });
    agentService.updateRun(runId, {
      status: 'cancelled',
      completedAt: Date.now(),
    });
    emit({ type: 'run-abort' });
  } catch (error) {
    const message = errorMessage(error);
    log.error('[agent] run crashed', message);
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
      plan: P1_PLAN,
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
