/**
 * RuntimeManager：main 侧 Run 生命周期的唯一管理者。
 *
 * - 创建 runId / AbortController
 * - 把 RunEvent 定向发送给发起请求的 WebContents（而不是全局广播）
 * - 维护活跃 run 的归属与状态；ChatService / 未来的 AgentRuntime 不持有窗口
 *
 * 事件只是通知；任务状态的可靠来源后续以数据库为准（P0/P1 落库）。
 */
import { randomUUID } from 'node:crypto';

import type { WebContents } from 'electron';

import { CHAT_CHANNELS, type RunEvent } from '@shared/chat';
import { sendTo } from '@main/infrastructure/ipc';

export type RunKind = 'chat' | 'agent';
export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** 传给执行器（ChatService / AgentRuntime）的运行上下文 */
export interface RunContext {
  runId: string;
  signal: AbortSignal;
  /** 已包装的 emitter：更新状态 + 定向发给发起窗口 */
  emit: (event: RunEvent) => void;
}

interface ActiveRun {
  id: string;
  kind: RunKind;
  status: RunStatus;
  controller: AbortController;
  ownerWebContentsId: number;
}

export class RuntimeManager {
  private runs = new Map<string, ActiveRun>();

  /**
   * 启动一个 run，执行器的返回值原样返回给 IPC 层。
   * 执行器内部负责同步返回 runId（写进 SendMessageResponse），异步通过 ctx.emit 推送。
   */
  start<T>(
    kind: RunKind,
    sender: WebContents,
    execute: (context: RunContext) => T,
  ): T {
    const runId = randomUUID();
    const controller = new AbortController();

    this.runs.set(runId, {
      id: runId,
      kind,
      status: 'running',
      controller,
      ownerWebContentsId: sender.id,
    });

    const emit = (event: RunEvent) => {
      this.applyStatus(runId, event);
      sendTo(sender, CHAT_CHANNELS.runEvent, event);
    };

    try {
      return execute({ runId, signal: controller.signal, emit });
    } catch (error) {
      // 同步启动失败：清理 run，避免悬挂
      this.runs.delete(runId);
      throw error;
    }
  }

  abort(runId: string) {
    this.runs.get(runId)?.controller.abort();
  }

  abortAll() {
    this.runs.forEach((run) => run.controller.abort());
  }

  /** 当前活跃 run 快照（供后续重新订阅 / 状态查询使用） */
  get(runId: string): Readonly<ActiveRun> | undefined {
    return this.runs.get(runId);
  }

  private applyStatus(runId: string, event: RunEvent) {
    switch (event.type) {
      case 'run-finish':
        this.finish(runId, 'completed');
        break;
      case 'run-error':
        this.finish(runId, 'failed');
        break;
      case 'run-abort':
        this.finish(runId, 'cancelled');
        break;
      default:
        break;
    }
  }

  private finish(runId: string, status: RunStatus) {
    const run = this.runs.get(runId);
    if (!run) return;

    run.status = status;
    this.runs.delete(runId);
  }
}

/** 应用内共享实例：Chat / Agent 共用同一份 run 注册表 */
export const runtimeManager = new RuntimeManager();
