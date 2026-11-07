/**
 * Chat 模块的 IPC 注册。
 *
 * - 入参走 shared 的 zod schema 校验
 * - run 生命周期交给 RuntimeManager：创建 runId / AbortController，
 *   并把事件定向发给发起本次 send 的 WebContents
 */
import { app } from 'electron';

import { CHAT_CHANNELS, chatAbortSchema, chatSendSchema } from '@shared/chat';
import { handleValidated } from '@main/infrastructure/ipc';

import { runtimeManager } from '../runtime/runtimeManager';
import { chatService } from './chatService';

export function registerChatIpc() {
  handleValidated(CHAT_CHANNELS.send, chatSendSchema, (req, event) =>
    runtimeManager.start('chat', event.sender, ({ runId, signal, emit }) =>
      chatService.send(req, { runId, signal, emit }),
    ),
  );

  handleValidated(CHAT_CHANNELS.abort, chatAbortSchema, ({ runId }) =>
    runtimeManager.abort(runId),
  );

  // 退出前取消所有正在进行的请求
  app.on('before-quit', () => runtimeManager.abortAll());
}
