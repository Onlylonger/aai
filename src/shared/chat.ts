/**
 * Conversation / Message / Run 的共享领域模型，以及统一事件协议。
 *
 * 核心思路：
 * - Conversation 是 Chat 和 Agent 共享的「会话」
 * - 每次用户发消息会产生一个 Run（一次执行），Chat 模式的 Run 就是一次 LLM 调用，
 *   Agent 模式的 Run 会包含多个 step（LLM → 工具 → LLM ...）
 * - main 进程把 Run 过程中发生的一切都转成 RunEvent 推给 renderer，
 *   renderer 只消费事件，不关心底层用的是哪家模型、哪种模式
 */
import { z } from 'zod';

import { modelRefSchema } from './api/provider';
import type { ModelRef } from './api/provider';

export type ConversationMode = 'chat' | 'agent';

export type MessageRole = 'user' | 'assistant';

export type MessageStatus = 'streaming' | 'done' | 'error' | 'aborted';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  /** 正文文本 */
  text: string;
  /** 推理过程（部分模型会返回，如 deepseek-reasoner） */
  reasoning?: string;
  status: MessageStatus;
  error?: string;
  model?: ModelRef;
  /** 产生该消息时使用的模式 */
  mode?: ConversationMode;
  createdAt: number;
}

/**
 * 会话：Chat 与 Agent 共用的容器，本身不区分模式。
 * lastMode / lastModel 只作为输入框的默认值，实际模式记录在每条消息上。
 */
export interface Conversation {
  id: string;
  title: string;
  lastMode: ConversationMode;
  lastModel?: ModelRef;
  createdAt: number;
  updatedAt: number;
}

/** chat:send 的入参校验（IPC 边界用） */
export const chatSendSchema = z.object({
  /** 不传表示新建会话 */
  conversationId: z.string().min(1).optional(),
  text: z.string().trim().min(1, '消息不能为空').max(100_000, '消息过长'),
  model: modelRefSchema,
});

export type SendMessageRequest = z.infer<typeof chatSendSchema>;

/** chat:abort 的入参校验 */
export const chatAbortSchema = z.object({
  runId: z.string().min(1),
});

/** conversation:messages 的入参校验 */
export const conversationMessagesSchema = z.object({
  conversationId: z.string().min(1),
});

export interface SendMessageResponse {
  conversationId: string;
  runId: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export type RunFinishReason =
  | 'stop'
  | 'length'
  | 'content-filter'
  | 'tool-calls'
  | 'error'
  | 'interrupted'
  | 'other';

export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface RunEventBase {
  runId: string;
  conversationId: string;
  /** 本次 run 产出的 assistant 消息 id */
  messageId: string;
  /** 事件时间戳 */
  ts: number;
}

/**
 * 统一事件协议。
 * 后续 Agent 模式会追加 step-start / step-finish / tool-call / tool-result / approval-request 等事件，
 * renderer 按 type 增量处理即可，不需要改动已有逻辑。
 */
export type RunEvent = RunEventBase &
  (
    | { type: 'run-start'; mode: ConversationMode; model: ModelRef }
    | { type: 'text-delta'; delta: string }
    | { type: 'reasoning-delta'; delta: string }
    | { type: 'run-finish'; finishReason: RunFinishReason; usage?: RunUsage }
    | { type: 'run-error'; error: string }
    | { type: 'run-abort' }
  );

export type RunEventType = RunEvent['type'];

/** Chat 模块的 IPC channel */
export const CHAT_CHANNELS = {
  send: 'chat:send',
  abort: 'chat:abort',
  /** main → renderer 推送 */
  runEvent: 'run:event',
} as const;

/** Conversation 模块的 IPC channel */
export const CONVERSATION_CHANNELS = {
  list: 'conversation:list',
  messages: 'conversation:messages',
} as const;

/** Chat 模块的 IPC 契约 */
export interface ChatIpcContract {
  [CHAT_CHANNELS.send]: [SendMessageRequest, SendMessageResponse];
  [CHAT_CHANNELS.abort]: [{ runId: string }, void];
}

/** Conversation 模块的 IPC 契约 */
export interface ConversationIpcContract {
  [CONVERSATION_CHANNELS.list]: [void, Conversation[]];
  [CONVERSATION_CHANNELS.messages]: [{ conversationId: string }, ChatMessage[]];
}

/** Chat 相关的 main → renderer 推送 */
export interface ChatIpcEvents {
  [CHAT_CHANNELS.runEvent]: RunEvent;
}
