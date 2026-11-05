/**
 * preload：在隔离的上下文里，把有限的、有类型的 API 暴露给 renderer。
 * renderer 只能通过 window.api 调用各模块 shared 契约里声明过的 channel
 * （契约汇总与参数/返回值类型见 @main/infrastructure/ipc）。
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import type {
  IpcArgs,
  IpcEventChannel,
  IpcEventMap,
  IpcInvokeChannel,
  IpcResult,
} from '@main/infrastructure/ipc';

async function invoke<C extends IpcInvokeChannel>(
  channel: C,
  args: IpcArgs<C>,
): Promise<IpcResult<C>> {
  const res = await ipcRenderer.invoke(channel, args);
  console.log('----Browser Invoke----', channel, `args: `, args, `res: `, res);
  return res;
}

function on<C extends IpcEventChannel>(
  channel: C,
  listener: (payload: IpcEventMap[C]) => void,
): () => void {
  const subscription = (_event: IpcRendererEvent, payload: IpcEventMap[C]) => {
    console.log('----Browser Receive----', _event, payload);
    return listener(payload);
  };
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
