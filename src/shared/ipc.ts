/**
 * IPC 契约：所有 channel 名称和请求/响应类型集中在这里定义。
 *
 * 两种通信方式：
 * - invoke（renderer → main，有返回值）：用 ipcRenderer.invoke / ipcMain.handle
 * - event（main → renderer，推送）：用 webContents.send / ipcRenderer.on
 */
import type {
  ChatMessage,
  Conversation,
  RunEvent,
  SendMessageRequest,
  SendMessageResponse,
} from './chat';
import type { ProviderConfigUpdate, ProviderConfigView } from './provider';

/** renderer → main 的调用，key 是 channel 名，值是 [参数, 返回值] */
export interface IpcInvokeMap {
  'chat:send': [SendMessageRequest, SendMessageResponse];
  'chat:abort': [{ runId: string }, void];
  'conversation:list': [void, Conversation[]];
  'conversation:messages': [{ conversationId: string }, ChatMessage[]];
  'provider:list': [void, ProviderConfigView[]];
  'provider:update': [ProviderConfigUpdate, ProviderConfigView];
}

/** main → renderer 的推送 */
export interface IpcEventMap {
  'run:event': RunEvent;
}

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcEventChannel = keyof IpcEventMap;
export type IpcArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C][0];
export type IpcResult<C extends IpcInvokeChannel> = IpcInvokeMap[C][1];
