/**
 * Conversation 模块的业务入口。
 *
 * 其他 main 模块（chat / 未来的 agent）只通过它读写会话与消息，
 * 不直接依赖 conversationRepo。
 */
import type { ModelRef } from '@shared/api/provider';
import type { ChatMessage, Conversation, ConversationMode } from '@shared/chat';

import { conversationRepo } from './conversationRepo';
import type { NewMessageInput } from './conversationRepo';

export const conversationService = {
  listConversations(): Conversation[] {
    return conversationRepo.listConversations();
  },

  getConversation(id: string): Conversation | null {
    return conversationRepo.getConversation(id);
  },

  createConversation(input: {
    title: string;
    lastMode?: ConversationMode;
  }): Conversation {
    return conversationRepo.createConversation(input);
  },

  /** 记录会话活跃时间与上次使用的模式 / 模型 */
  touchConversation(
    id: string,
    patch?: { lastMode?: ConversationMode; lastModel?: ModelRef },
  ): void {
    conversationRepo.touchConversation(id, patch);
  },

  listMessages(conversationId: string): ChatMessage[] {
    return conversationRepo.listMessages(conversationId);
  },

  addMessage(input: NewMessageInput): ChatMessage {
    return conversationRepo.addMessage(input);
  },

  updateMessage(id: string, patch: Partial<ChatMessage>): ChatMessage | null {
    return conversationRepo.updateMessage(id, patch);
  },
};

export type { NewMessageInput };
