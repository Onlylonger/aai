/**
 * IPC 注册：把 shared/ipc.ts 中定义的契约绑定到具体的 service。
 * 用 handle<C>() 包一层，保证 channel、参数、返回值的类型和契约一致。
 */
import { BrowserWindow, ipcMain } from 'electron';

import type {
  IpcArgs,
  IpcEventChannel,
  IpcEventMap,
  IpcInvokeChannel,
  IpcResult,
} from '../../shared/ipc';
import { ChatService } from '../chat/chatService';
import { conversationRepo } from '../conversation/conversationRepo';
import { providerStore } from '../settings/providerStore';

function handle<C extends IpcInvokeChannel>(
  channel: C,
  handler: (args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>,
) {
  ipcMain.handle(channel, (_event, args: IpcArgs<C>) => handler(args));
}

/** 广播给所有窗口（目前只有一个主窗口） */
function broadcast<C extends IpcEventChannel>(channel: C, payload: IpcEventMap[C]) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

export function registerIpc() {
  const chatService = new ChatService((event) => broadcast('run:event', event));

  handle('chat:send', (req) => chatService.send(req));
  handle('chat:abort', ({ runId }) => chatService.abort(runId));

  handle('conversation:list', () => conversationRepo.listConversations());
  handle('conversation:messages', ({ conversationId }) =>
    conversationRepo.listMessages(conversationId),
  );

  handle('provider:list', () => providerStore.list());
  handle('provider:update', (patch) => providerStore.update(patch));

  return { chatService };
}
