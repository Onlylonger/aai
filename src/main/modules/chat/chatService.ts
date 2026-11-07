/**
 * ChatService：Chat 模式的执行器（无状态）。
 *
 * 流程：
 *   1. 写入 user 消息 + 一条空的 assistant 消息（status = streaming）
 *   2. 立即返回 runId 给 renderer（不等模型回复）
 *   3. 后台调用 streamText，把 AI SDK 的 fullStream 转成我们自己的 RunEvent 推给 renderer
 *   4. 结束 / 出错 / 取消时更新 assistant 消息状态
 *
 * runId / AbortController / 事件投递由 RuntimeManager 负责；
 * 本模块只做「执行一次 Chat」，不持有跨调用状态，因此以普通对象导出，
 * 与 providerService 的形态保持一致。
 */
import { streamText, type ModelMessage } from 'ai';
import log from 'electron-log';

import type {
  ChatMessage,
  RunEvent,
  SendMessageRequest,
  SendMessageResponse,
} from '@shared/chat';
import { conversationRepo } from '../conversation/conversationRepo';
import { getLanguageModel } from '../provider/providerRegistry';

/** 事件发射器：由调用方注入，ChatService 不直接依赖 BrowserWindow */
export type RunEventEmitter = (event: RunEvent) => void;

/** ChatService 一次执行所需的运行上下文（由 RuntimeManager 创建） */
export interface ChatRunContext {
  runId: string;
  signal: AbortSignal;
  emit: RunEventEmitter;
}

type RunEventPayload = RunEvent extends infer E
  ? E extends RunEvent
    ? Omit<E, 'runId' | 'conversationId' | 'messageId' | 'ts'>
    : never
  : never;

const SYSTEM_PROMPT = 'You are a helpful assistant.';

function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter((m) => m.text && (m.role === 'user' || m.status === 'done'))
    .map((m) => ({ role: m.role, content: m.text }));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function execute(opts: {
  req: SendMessageRequest;
  messages: ModelMessage[];
  assistantMessage: ChatMessage;
  signal: AbortSignal;
  emit: (payload: RunEventPayload) => void;
}) {
  const { req, messages, assistantMessage, signal, emit } = opts;
  let text = '';
  let reasoning = '';

  emit({ type: 'run-start', mode: 'chat', model: req.model });

  const fail = (error: unknown) => {
    const message = errorMessage(error);
    log.error('[chat] run failed', message);
    conversationRepo.updateMessage(assistantMessage.id, {
      text,
      reasoning: reasoning || undefined,
      status: 'error',
      error: message,
    });
    emit({ type: 'run-error', error: message });
  };

  try {
    const model = await getLanguageModel(req.model);
    const result = streamText({
      model,
      instructions: SYSTEM_PROMPT,
      messages,
      abortSignal: signal,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          emit({ type: 'text-delta', delta: part.text });
          break;
        case 'reasoning-delta':
          reasoning += part.text;
          emit({ type: 'reasoning-delta', delta: part.text });
          break;
        case 'error':
          // 流内错误（如 401、限流），AI SDK 不会 throw，而是作为 part 返回
          fail(part.error);
          return;
        case 'abort':
          conversationRepo.updateMessage(assistantMessage.id, {
            text,
            reasoning: reasoning || undefined,
            status: 'aborted',
          });
          emit({ type: 'run-abort' });
          return;
        case 'finish':
          conversationRepo.updateMessage(assistantMessage.id, {
            text,
            reasoning: reasoning || undefined,
            status: 'done',
          });
          emit({
            type: 'run-finish',
            finishReason: part.finishReason,
            usage: {
              inputTokens: part.totalUsage.inputTokens,
              outputTokens: part.totalUsage.outputTokens,
              totalTokens: part.totalUsage.totalTokens,
            },
          });
          return;
        default:
          // 其他 part（step-start、tool-call 等）在 Agent 阶段再处理
          break;
      }
    }

    // 兜底：流结束了但没有收到 finish / abort / error
    conversationRepo.updateMessage(assistantMessage.id, {
      text,
      status: 'done',
    });
    emit({ type: 'run-finish', finishReason: 'other' });
  } catch (error) {
    if (signal.aborted) {
      conversationRepo.updateMessage(assistantMessage.id, {
        text,
        status: 'aborted',
      });
      emit({ type: 'run-abort' });
      return;
    }
    fail(error);
  }
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
        conversationRepo.getConversation(req.conversationId)) ||
      conversationRepo.createConversation({
        title: text.slice(0, 30),
        mode: 'chat',
      });

    // 历史消息要在写入新消息之前取出
    const history = conversationRepo.listMessages(conversation.id);

    const userMessage = conversationRepo.addMessage({
      conversationId: conversation.id,
      role: 'user',
      text,
      status: 'done',
    });
    const assistantMessage = conversationRepo.addMessage({
      conversationId: conversation.id,
      role: 'assistant',
      text: '',
      status: 'streaming',
      model: req.model,
    });
    conversationRepo.touchConversation(conversation.id);

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
