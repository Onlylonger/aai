/**
 * Conversation 模块的 IPC 注册。
 */
import {
  CONVERSATION_CHANNELS,
  conversationMessagesSchema,
} from '@shared/chat';
import { handle, handleValidated } from '@main/infrastructure/ipc';

import { conversationService } from './conversationService';

export function registerConversationIpc() {
  handle(CONVERSATION_CHANNELS.list, () =>
    conversationService.listConversations(),
  );

  handleValidated(
    CONVERSATION_CHANNELS.messages,
    conversationMessagesSchema,
    ({ conversationId }) => conversationService.listMessages(conversationId),
  );
}
