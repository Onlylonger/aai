/**
 * Chat 状态管理（zustand）。
 *
 * renderer 侧的「单一数据源」：
 * - 用户操作（send / abort）→ 调用 window.api.invoke
 * - main 推送的 RunEvent → applyRunEvent 增量更新消息
 *
 * 组件只读 store，不直接碰 IPC。
 */
import { create } from 'zustand';

import type { ChatMessage, RunEvent } from '../../../../shared/chat';
import type { ModelRef } from '../../../../shared/provider';

interface ChatState {
  conversationId?: string;
  messages: ChatMessage[];
  /** 当前正在执行的 run，用于停止按钮 */
  activeRunId?: string;
  model?: ModelRef;
  sendError?: string;

  setModel: (model: ModelRef) => void;
  newConversation: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  applyRunEvent: (event: RunEvent) => void;
}

const MODEL_KEY = 'chat:lastModel';

/** chat:send 进行中标记，以及期间到达的事件缓冲 */
let sending = false;
let pendingEvents: RunEvent[] = [];

function loadLastModel(): ModelRef | undefined {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    return raw ? (JSON.parse(raw) as ModelRef) : undefined;
  } catch {
    return undefined;
  }
}

function patchMessage(
  messages: ChatMessage[],
  id: string,
  update: (m: ChatMessage) => Partial<ChatMessage>,
) {
  return messages.map((m) => (m.id === id ? { ...m, ...update(m) } : m));
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  model: loadLastModel(),

  setModel(model) {
    localStorage.setItem(MODEL_KEY, JSON.stringify(model));
    set({ model });
  },

  newConversation() {
    set({
      conversationId: undefined,
      messages: [],
      activeRunId: undefined,
      sendError: undefined,
    });
  },

  async loadConversation(conversationId) {
    const messages = await window.api.invoke('conversation:messages', {
      conversationId,
    });
    set({ conversationId, messages, sendError: undefined });
  },

  async send(text) {
    const { model, conversationId, activeRunId } = get();
    if (activeRunId || sending) return;
    if (!model) {
      set({ sendError: '请先选择模型' });
      return;
    }
    set({ sendError: undefined });

    sending = true;
    try {
      const res = await window.api.invoke('chat:send', {
        conversationId,
        text,
        model,
      });
      set((s) => ({
        conversationId: res.conversationId,
        activeRunId: res.runId,
        messages: [...s.messages, res.userMessage, res.assistantMessage],
      }));
    } catch (error) {
      set({
        sendError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      sending = false;
      // 重放 invoke 返回前就到达的事件
      const early = pendingEvents;
      pendingEvents = [];
      early.forEach((e) => get().applyRunEvent(e));
    }
  },

  async abort() {
    const { activeRunId } = get();
    if (activeRunId)
      await window.api.invoke('chat:abort', { runId: activeRunId });
  },

  applyRunEvent(event) {
    // send 还没返回时（消息还没加入列表、新会话还不知道 conversationId），先缓冲
    if (sending) {
      pendingEvents.push(event);
      return;
    }
    if (event.conversationId !== get().conversationId) return;

    set((s) => {
      const { messageId } = event;
      switch (event.type) {
        case 'run-start':
          return { activeRunId: event.runId };
        case 'text-delta':
          return {
            messages: patchMessage(s.messages, messageId, (m) => ({
              text: m.text + event.delta,
            })),
          };
        case 'reasoning-delta':
          return {
            messages: patchMessage(s.messages, messageId, (m) => ({
              reasoning: (m.reasoning ?? '') + event.delta,
            })),
          };
        case 'run-finish':
          return {
            activeRunId: undefined,
            messages: patchMessage(s.messages, messageId, () => ({
              status: 'done',
            })),
          };
        case 'run-error':
          return {
            activeRunId: undefined,
            messages: patchMessage(s.messages, messageId, () => ({
              status: 'error',
              error: event.error,
            })),
          };
        case 'run-abort':
          return {
            activeRunId: undefined,
            messages: patchMessage(s.messages, messageId, () => ({
              status: 'aborted',
            })),
          };
        default:
          return {};
      }
    });
  },
}));

/** 全局只订阅一次 main 推送的事件 */
let subscribed = false;
export function subscribeRunEvents() {
  if (subscribed || !window.api) return;
  subscribed = true;
  window.api.on('run:event', (event) =>
    useChatStore.getState().applyRunEvent(event),
  );
}
