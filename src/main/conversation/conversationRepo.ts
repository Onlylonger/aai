/**
 * 会话仓储。
 *
 * 现在是内存实现，目的是先把 Chat 跑通；
 * 下一步换成 SQLite + drizzle 时，只需要提供同样接口的实现，ChatService 不用改。
 */
import { randomUUID } from 'node:crypto';

import type { ChatMessage, Conversation, ConversationMode } from '../../shared/chat';

export interface ConversationRepo {
  createConversation(input: { title: string; mode: ConversationMode }): Conversation;
  getConversation(id: string): Conversation | undefined;
  listConversations(): Conversation[];
  touchConversation(id: string): void;

  addMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage;
  updateMessage(id: string, patch: Partial<ChatMessage>): ChatMessage | undefined;
  listMessages(conversationId: string): ChatMessage[];
}

class InMemoryConversationRepo implements ConversationRepo {
  private conversations = new Map<string, Conversation>();

  private messages = new Map<string, ChatMessage>();

  createConversation(input: { title: string; mode: ConversationMode }) {
    const now = Date.now();
    const conversation: Conversation = {
      id: randomUUID(),
      title: input.title,
      mode: input.mode,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  getConversation(id: string) {
    return this.conversations.get(id);
  }

  listConversations() {
    return [...this.conversations.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  touchConversation(id: string) {
    const c = this.conversations.get(id);
    if (c) c.updatedAt = Date.now();
  }

  addMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>) {
    const message: ChatMessage = { ...input, id: randomUUID(), createdAt: Date.now() };
    this.messages.set(message.id, message);
    return message;
  }

  updateMessage(id: string, patch: Partial<ChatMessage>) {
    const m = this.messages.get(id);
    if (!m) return undefined;
    Object.assign(m, patch);
    return m;
  }

  listMessages(conversationId: string) {
    return [...this.messages.values()]
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}

export const conversationRepo: ConversationRepo = new InMemoryConversationRepo();
