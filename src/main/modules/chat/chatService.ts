/**
 * ChatService：Chat 模式的执行器（无状态）。
 *
 * 流程：
 *   1. 写入 user 消息 + 一条空的 assistant 消息（status = streaming）
 *   2. 立即返回 runId 给 renderer（不等模型回复）
 *   3. 后台调用模型，把增量转成 RunEvent 推给 renderer
 *   4. 结束 / 出错 / 取消时更新 assistant 消息状态
 *
 * runId / AbortController / 事件投递由 RuntimeManager 负责；
 * 本模块只做「执行一次 Chat」，不持有跨调用状态，因此以普通对象导出。
 */
import type { ModelMessage } from 'ai';
import log from 'electron-log';

import type {
  ChatMessage,
  RunEvent,
  SendMessageRequest,
  SendMessageResponse,
} from '@shared/chat';
import { conversationService } from '../conversation/conversationService';

import { toModelMessages } from './messageHistory';
import { streamAssistant } from './streamAssistant';

/** 事件发射器：由调用方注入，ChatService 不直接依赖 BrowserWindow */
export type RunEventEmitter = (event: RunEvent) => void;

/** ChatService 一次执行所需的运行上下文（由 RuntimeManager 创建） */
export interface ChatRunContext {
  runId: string;
  signal: AbortSignal;
  emit: RunEventEmitter;
}

export type RunEventPayload = RunEvent extends infer E
  ? E extends RunEvent
    ? Omit<E, 'runId' | 'conversationId' | 'messageId' | 'ts'>
    : never
  : never;

const SYSTEM_PROMPT = 'You are a helpful assistant.';

async function execute(opts: {
  req: SendMessageRequest;
  messages: ModelMessage[];
  assistantMessage: ChatMessage;
  signal: AbortSignal;
  emit: (payload: RunEventPayload) => void;
}) {
  const { req, messages, assistantMessage, signal, emit } = opts;

  emit({ type: 'run-start', mode: 'chat', model: req.model });

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
    emit({
      type: 'run-finish',
      finishReason: outcome.finishReason,
      usage: outcome.usage,
    });
    return;
  }

  if (outcome.type === 'error') {
    log.error('[chat] run failed', outcome.error);
    conversationService.updateMessage(assistantMessage.id, {
      text: outcome.text,
      reasoning: outcome.reasoning || undefined,
      status: 'error',
      error: outcome.error,
    });
    emit({ type: 'run-error', error: outcome.error });
    return;
  }

  conversationService.updateMessage(assistantMessage.id, {
    text: outcome.text,
    reasoning: outcome.reasoning || undefined,
    status: 'aborted',
  });
  emit({ type: 'run-abort' });
}

export const chatService = {
  /**
   * 执行一次 Chat。
   * runId / signal / emit 由 RuntimeManager 提供；本模块无跨调用状态，
   * 也不关心事件送往哪里。
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
        lastMode: 'chat',
      });

    // 历史消息要在写入新消息之前取出
    const history = conversationService.listMessages(conversation.id);

    const userMessage = conversationService.addMessage({
      conversationId: conversation.id,
      role: 'user',
      text,
      status: 'done',
      mode: 'chat',
    });
    const assistantMessage = conversationService.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '',
      status: 'streaming',
      mode: 'chat',
      model: req.model,
    });
    conversationService.touchConversation(conversation.id, {
      lastMode: 'chat',
      lastModel: req.model,
    });

    const emitEvent = (payload: RunEventPayload) =>
      emit({
        ...payload,
        runId,
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        ts: Date.now(),
      } as RunEvent);

    // 不 await：让 IPC 先返回，流式内容通过事件推送
    void execute({
      req,
      messages: [...toModelMessages(history), { role: 'user', content: text }],
      assistantMessage,
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
