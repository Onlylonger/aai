/**
 * Chat 模块的 IPC 注册。
 */
import { app } from 'electron';

import { CHAT_CHANNELS } from '@shared/chat';
import { broadcast, handle } from '@main/infrastructure/ipc';

import { ChatService } from './chatService';

export function registerChatIpc() {
  // ChatService 只负责产出事件，怎么推给 renderer 由 IPC 层决定
  const chatService = new ChatService((event) =>
    broadcast(CHAT_CHANNELS.runEvent, event),
  );

  handle(CHAT_CHANNELS.send, (req) => chatService.send(req));
  handle(CHAT_CHANNELS.abort, ({ runId }) => chatService.abort(runId));

  // 退出前取消所有正在进行的请求
  app.on('before-quit', () => chatService.abortAll());
}
