/**
 * preload：在隔离的上下文里，把有限的、有类型的 API 暴露给 renderer。
 * renderer 只能通过 window.api 调用 shared/ipc.ts 中声明过的 channel。
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import type {
  IpcArgs,
  IpcEventChannel,
  IpcEventMap,
  IpcInvokeChannel,
  IpcResult,
} from '../shared/ipc';

function invoke<C extends IpcInvokeChannel>(
  channel: C,
  args: IpcArgs<C>,
): Promise<IpcResult<C>> {
  return ipcRenderer.invoke(channel, args);
}

function on<C extends IpcEventChannel>(
  channel: C,
  listener: (payload: IpcEventMap[C]) => void,
): () => void {
  const subscription = (_event: IpcRendererEvent, payload: IpcEventMap[C]) =>
    listener(payload);
  ipcRenderer.on(channel, subscription);
  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
}

const api = {
  invoke,
  on,
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;
