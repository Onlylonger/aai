/**
 * Conversation 模块的 IPC 注册。
 */
import {
  CONVERSATION_CHANNELS,
  conversationMessagesSchema,
} from '@shared/chat';
import { handle, handleValidated } from '@main/infrastructure/ipc';

import { conversationRepo } from './conversationRepo';

export function registerConversationIpc() {
  handle(CONVERSATION_CHANNELS.list, () =>
    conversationRepo.listConversations(),
  );

  handleValidated(
    CONVERSATION_CHANNELS.messages,
    conversationMessagesSchema,
    ({ conversationId }) => conversationRepo.listMessages(conversationId),
  );
}
