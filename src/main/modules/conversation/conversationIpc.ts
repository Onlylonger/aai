/**
 * Conversation 模块的 IPC 注册。
 */
import { CONVERSATION_CHANNELS } from '@shared/chat';
import { handle } from '@main/infrastructure/ipc';

import { conversationRepo } from './conversationRepo';

export function registerConversationIpc() {
  handle(CONVERSATION_CHANNELS.list, () =>
    conversationRepo.listConversations(),
  );
  handle(CONVERSATION_CHANNELS.messages, ({ conversationId }) =>
    conversationRepo.listMessages(conversationId),
  );
}
