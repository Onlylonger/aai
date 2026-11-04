/**
 * Chat 状态管理（zustand）。
 *
 * renderer 侧的「单一数据源」：
 * - 用户操作（send / abort）→ 调用 window.api.invoke
 * - main 推送的 RunEvent → applyRunEvent 增量更新消息与 run 状态
 *
 * 运行状态按 runId 管理（runs）；activeRunId 只是「当前会话正在运行的 run」
 * 的快捷引用。Agent 的执行步骤（steps）也挂在 run 上，以折叠卡片展示。
 */
import { create } from 'zustand';

import {
  AGENT_CHANNELS,
  type AgentRunStatus,
  type AgentRunView,
  type AgentStepView,
} from '@shared/api/agent';
import {
  CHAT_CHANNELS,
  CONVERSATION_CHANNELS,
  type ChatMessage,
  type ConversationMode,
  type RunEvent,
} from '@shared/chat';
import type { ModelRef } from '@shared/api/provider';

export interface RunState {
  runId: string;
  conversationId: string;
  /** 本次 run 产出的 assistant 消息 id */
  messageId: string;
  mode: ConversationMode;
  status: 'running' | 'done' | 'error' | 'aborted';
  plan?: string;
  error?: string;
  steps: AgentStepView[];
}

interface ChatState {
  conversationId?: string;
  messages: ChatMessage[];
  /** 所有已知 run 的状态，按 runId 索引 */
  runs: Record<string, RunState>;
  /** 当前会话正在执行的 run，用于停止按钮 */
  activeRunId?: string;
  model?: ModelRef;
  mode: ConversationMode;
  sendError?: string;

  setModel: (model: ModelRef) => void;
  setMode: (mode: ConversationMode) => void;
  newConversation: () => void;
  loadConversation: (conversationId: string) => Promise<void>;
  /** 应用启动时恢复上次打开的会话 */
  restoreLastConversation: () => Promise<void>;
  send: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  applyRunEvent: (event: RunEvent) => void;
}

const MODEL_KEY = 'chat:lastModel';
const MODE_KEY = 'chat:lastMode';
const CONVERSATION_KEY = 'chat:lastConversation';

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

function loadLastMode(): ConversationMode {
  return localStorage.getItem(MODE_KEY) === 'agent' ? 'agent' : 'chat';
}

function patchMessage(
  messages: ChatMessage[],
  id: string,
  update: (m: ChatMessage) => Partial<ChatMessage>,
) {
  return messages.map((m) => (m.id === id ? { ...m, ...update(m) } : m));
}

function toRunStatus(status: AgentRunStatus): RunState['status'] {
  switch (status) {
    case 'completed':
      return 'done';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'aborted';
    default:
      return 'running';
  }
}

function fromAgentRun(run: AgentRunView): RunState {
  return {
    runId: run.id,
    conversationId: run.conversationId,
    messageId: run.messageId,
    mode: 'agent',
    status: toRunStatus(run.status),
    plan: run.plan,
    error: run.error,
    steps: run.steps,
  };
}

/** 合并式更新：未提供的字段保留已有值 */
function upsertRun(
  runs: Record<string, RunState>,
  patch: Pick<RunState, 'runId' | 'conversationId' | 'messageId'> &
    Partial<RunState>,
): Record<string, RunState> {
  const base = runs[patch.runId];

  return {
    ...runs,
    [patch.runId]: {
      runId: patch.runId,
      conversationId: patch.conversationId,
      messageId: patch.messageId,
      mode: patch.mode ?? base?.mode ?? 'chat',
      status: patch.status ?? base?.status ?? 'running',
      plan: patch.plan ?? base?.plan,
      error: patch.error ?? base?.error,
      steps: patch.steps ?? base?.steps ?? [],
    },
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  runs: {},
  model: loadLastModel(),
  mode: loadLastMode(),

  setModel(model) {
    localStorage.setItem(MODEL_KEY, JSON.stringify(model));
    set({ model });
  },

  setMode(mode) {
    localStorage.setItem(MODE_KEY, mode);
    set({ mode });
  },

  newConversation() {
    localStorage.removeItem(CONVERSATION_KEY);
    set({
      conversationId: undefined,
      messages: [],
      activeRunId: undefined,
      sendError: undefined,
    });
  },

  async loadConversation(conversationId) {
    const [messages, agentRuns] = await Promise.all([
      window.api.invoke(CONVERSATION_CHANNELS.messages, { conversationId }),
      window.api.invoke(AGENT_CHANNELS.runs, { conversationId }),
    ]);
    localStorage.setItem(CONVERSATION_KEY, conversationId);

    const loadedRuns: Record<string, RunState> = {};
    for (const run of agentRuns) {
      loadedRuns[run.id] = fromAgentRun(run);
    }

    const activeRun = Object.values(loadedRuns).find(
      (run) => run.status === 'running',
    );

    set((s) => ({
      conversationId,
      messages,
      runs: { ...s.runs, ...loadedRuns },
      activeRunId: activeRun?.runId,
      sendError: undefined,
    }));
  },

  async restoreLastConversation() {
    const conversationId = localStorage.getItem(CONVERSATION_KEY);
    if (!conversationId) return;

    try {
      await get().loadConversation(conversationId);
    } catch {
      // 会话可能已被删除，清理本地记录即可
      localStorage.removeItem(CONVERSATION_KEY);
    }
  },

  async send(text) {
    const { model, conversationId, activeRunId, mode } = get();
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
        mode,
      });
      localStorage.setItem(CONVERSATION_KEY, res.conversationId);
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
              mode: res.assistantMessage.mode ?? mode,
              status: 'running',
              steps: [],
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
    const state = get();
    const isCurrent = conversationId === state.conversationId;
    const run = state.runs[runId];

    switch (event.type) {
      case 'run-start':
        set({
          runs: upsertRun(state.runs, {
            runId,
            conversationId,
            messageId,
            mode: event.mode,
            status: 'running',
            steps: [],
          }),
          activeRunId: isCurrent ? runId : state.activeRunId,
        });
        return;

      case 'agent-plan':
        set({
          runs: upsertRun(state.runs, {
            runId,
            conversationId,
            messageId,
            plan: event.plan,
          }),
        });
        return;

      case 'step-start':
        set({
          runs: upsertRun(state.runs, {
            runId,
            conversationId,
            messageId,
            steps: [
              ...(run?.steps ?? []).filter((s) => s.id !== event.step.id),
              event.step,
            ],
          }),
        });
        return;

      case 'step-finish':
        set({
          runs: upsertRun(state.runs, {
            runId,
            conversationId,
            messageId,
            steps: (run?.steps ?? []).map((step) =>
              step.id === event.stepId
                ? {
                    ...step,
                    status: event.status,
                    output: event.output ?? step.output,
                    error: event.error ?? step.error,
                    completedAt: Date.now(),
                  }
                : step,
            ),
          }),
        });
        return;

      case 'run-finish':
      case 'run-error':
      case 'run-abort': {
        const status =
          event.type === 'run-finish'
            ? 'done'
            : event.type === 'run-error'
              ? 'error'
              : 'aborted';

        set({
          runs: upsertRun(state.runs, {
            runId,
            conversationId,
            messageId,
            status,
            error: event.type === 'run-error' ? event.error : undefined,
          }),
          activeRunId:
            state.activeRunId === runId ? undefined : state.activeRunId,
        });
        break;
      }

      default:
        break;
    }

    if (!isCurrent) return;

    // 更新当前会话的消息
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
