/**
 * Chat 模块的 IPC 注册。
 *
 * 事件定向发送：只发给发起本次 send 的 WebContents，不再全局广播。
 * 事件只是通知，任务状态的可靠来源在 main 侧（后续落库后以 DB 为准）。
 */
import { app } from 'electron';

import { CHAT_CHANNELS, chatAbortSchema, chatSendSchema } from '@shared/chat';
import { handleValidated, sendTo } from '@main/infrastructure/ipc';

import { ChatService } from './chatService';

export function registerChatIpc() {
  const chatService = new ChatService();

  handleValidated(CHAT_CHANNELS.send, chatSendSchema, (req, event) => {
    const sender = event.sender;

    return chatService.send(req, (payload) =>
      sendTo(sender, CHAT_CHANNELS.runEvent, payload),
    );
  });

  handleValidated(CHAT_CHANNELS.abort, chatAbortSchema, ({ runId }) =>
    chatService.abort(runId),
  );

  // 退出前取消所有正在进行的请求
  app.on('before-quit', () => chatService.abortAll());
}
