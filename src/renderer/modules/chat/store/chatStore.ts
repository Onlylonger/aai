/**
 * Chat 状态管理（zustand）。
 *
 * renderer 侧的「单一数据源」：
 * - 用户操作（send / abort）→ 调用 window.api.invoke
 * - main 推送的 RunEvent → applyRunEvent 增量更新消息与 run 状态
 *
 * 运行状态按 runId 管理（runs），activeRunId 只是「当前会话正在运行的 run」
 * 的快捷引用，方便停止按钮使用。
 * 组件只读 store，不直接碰 IPC。
 */
import { create } from 'zustand';

import {
  CHAT_CHANNELS,
  CONVERSATION_CHANNELS,
  type ChatMessage,
  type RunEvent,
} from '@shared/chat';
import type { ModelRef } from '@shared/api/provider';

interface RunState {
  runId: string;
  conversationId: string;
  /** 本次 run 产出的 assistant 消息 id */
  messageId: string;
  status: 'running' | 'done' | 'error' | 'aborted';
  error?: string;
}

interface ChatState {
  conversationId?: string;
  messages: ChatMessage[];
  /** 所有已知 run 的状态，按 runId 索引 */
  runs: Record<string, RunState>;
  /** 当前会话正在执行的 run，用于停止按钮 */
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

function upsertRun(
  runs: Record<string, RunState>,
  run: RunState,
): Record<string, RunState> {
  return { ...runs, [run.runId]: { ...runs[run.runId], ...run } };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  runs: {},
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
    const messages = await window.api.invoke(CONVERSATION_CHANNELS.messages, {
      conversationId,
    });

    // 该会话可能仍有 Run 在后台执行：恢复停止按钮的状态
    const activeRun = Object.values(get().runs).find(
      (run) =>
        run.conversationId === conversationId && run.status === 'running',
    );

    set({
      conversationId,
      messages,
      activeRunId: activeRun?.runId,
      sendError: undefined,
    });
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
      const res = await window.api.invoke(CHAT_CHANNELS.send, {
        conversationId,
        text,
        model,
      });
      set((s) => ({
        conversationId: res.conversationId,
        activeRunId: res.runId,
        messages: [...s.messages, res.userMessage, res.assistantMessage],
        runs: s.runs[res.runId]
          ? s.runs
          : upsertRun(s.runs, {
              runId: res.runId,
              conversationId: res.conversationId,
              messageId: res.assistantMessage.id,
              status: 'running',
            }),
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
      await window.api.invoke(CHAT_CHANNELS.abort, { runId: activeRunId });
  },

  applyRunEvent(event) {
    // send 还没返回时（消息还没加入列表、新会话还不知道 conversationId），先缓冲
    if (sending) {
      pendingEvents.push(event);
      return;
    }

    const { runId, conversationId, messageId } = event;
    const isCurrent = conversationId === get().conversationId;

    // 1) 更新 run 状态表（即使事件属于其他会话也记录）
    if (event.type === 'run-start') {
      set((s) => ({
        runs: upsertRun(s.runs, {
          runId,
          conversationId,
          messageId,
          status: 'running',
        }),
        activeRunId: isCurrent ? runId : s.activeRunId,
      }));
      return;
    }

    if (
      event.type === 'run-finish' ||
      event.type === 'run-error' ||
      event.type === 'run-abort'
    ) {
      const status =
        event.type === 'run-finish'
          ? 'done'
          : event.type === 'run-error'
            ? 'error'
            : 'aborted';

      set((s) => ({
        runs: upsertRun(s.runs, {
          runId,
          conversationId,
          messageId,
          status,
          error: event.type === 'run-error' ? event.error : undefined,
        }),
        activeRunId: s.activeRunId === runId ? undefined : s.activeRunId,
      }));
    }

    if (!isCurrent) return;

    // 2) 更新当前会话的消息
    set((s) => {
      switch (event.type) {
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
            messages: patchMessage(s.messages, messageId, () => ({
              status: 'done',
            })),
          };
        case 'run-error':
          return {
            messages: patchMessage(s.messages, messageId, () => ({
              status: 'error',
              error: event.error,
            })),
          };
        case 'run-abort':
          return {
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
  window.api.on(CHAT_CHANNELS.runEvent, (event) =>
    useChatStore.getState().applyRunEvent(event),
  );
}
