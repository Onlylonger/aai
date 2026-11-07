/**
 * IPC 基础设施：带类型约束的 handle / handleValidated / broadcast。
 *
 * 各模块在自己的 xxxIpc.ts 中调用 handle() / handleValidated() 注册 channel，
 * channel 名、参数、返回值都必须符合 shared 中的契约，写错会直接编译报错。
 */

/**
 * IPC 契约汇总。
 *
 * 每个模块在自己的 shared 文件里声明契约（如 ProviderIpcContract），这里只负责合并。
 * 新增模块：在模块文件里定义 XxxIpcContract，然后加到下面的交集类型里。
 *
 * 两种通信方式：
 * - invoke（renderer → main，有返回值）：ipcRenderer.invoke / ipcMain.handle
 * - event（main → renderer，推送）：webContents.send / ipcRenderer.on
 */
import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import log from 'electron-log';
import type { ZodType } from 'zod';

import type {
  ChatIpcContract,
  ChatIpcEvents,
  ConversationIpcContract,
} from '@shared/chat';
import type { ProviderIpcContract } from '@shared/api/provider';
import type { AgentIpcContract } from '@shared/api/agent';

/** renderer → main 的调用，key 是 channel 名，值是 [参数, 返回值] */
export type IpcInvokeMap = ChatIpcContract &
  ConversationIpcContract &
  ProviderIpcContract &
  AgentIpcContract;

/** main → renderer 的推送 */
export type IpcEventMap = ChatIpcEvents;

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcEventChannel = keyof IpcEventMap;
export type IpcArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C][0];
export type IpcResult<C extends IpcInvokeChannel> = IpcInvokeMap[C][1];

/** 注册 renderer → main 的调用 */
export function handle<C extends IpcInvokeChannel>(
  channel: C,
  handler: (
    args: IpcArgs<C>,
    event: IpcMainInvokeEvent,
  ) => IpcResult<C> | Promise<IpcResult<C>>,
) {
  ipcMain.handle(channel, async (event, args: IpcArgs<C>) => {
    try {
      const res = await handler(args, event);
      log.debug('[ipc]', channel, args, res);
      return res;
    } catch (error) {
      // 错误会被 Electron 序列化后在 renderer 的 invoke 处 reject
      log.error('[ipc]', channel, error);
      throw error;
    }
  });
}

/**
 * 按 shared 的 zod schema 校验 IPC 入参。
 * 失败时抛出带字段路径的可读错误（renderer 的 invoke 会 reject）。
 */
export function parsePayload<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid IPC payload: ${detail}`);
  }
  return result.data;
}

/**
 * 带运行期校验的 handle。
 *
 * renderer 是不可信侧：TS 类型在运行期不存在，因此每个接收外部输入的 channel
 * 都应通过它注册——schema 来自 shared，handler 拿到的就是已校验的数据。
 */
export function handleValidated<
  C extends IpcInvokeChannel,
  S extends IpcArgs<C>,
>(
  channel: C,
  schema: ZodType<S>,
  handler: (
    args: S,
    event: IpcMainInvokeEvent,
  ) => IpcResult<C> | Promise<IpcResult<C>>,
) {
  handle(channel, (args, event) => handler(parsePayload(schema, args), event));
}

/**
 * 定向发送 main → renderer 事件。
 * 只发给指定的 WebContents（通常是发起本次调用的窗口）；窗口已销毁时静默丢弃，
 * 状态恢复应依赖数据库而不是事件重放。
 */
export function sendTo<C extends IpcEventChannel>(
  sender: WebContents,
  channel: C,
  payload: IpcEventMap[C],
) {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

/** main → renderer 推送，广播给所有窗口（目前只有一个主窗口） */
export function broadcast<C extends IpcEventChannel>(
  channel: C,
  payload: IpcEventMap[C],
) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}
