/**
 * Conversation 模块的数据访问层（SQLite + drizzle）。
 *
 * 只做数据库读写与行 → 领域模型映射，不写业务规则。
 * 对外统一通过 conversationService 使用。
 */
import { randomUUID } from 'node:crypto';

import { asc, desc, eq, sql } from 'drizzle-orm';

import type { ModelRef } from '@shared/api/provider';
import type {
  ChatMessage,
  Conversation,
  ConversationMode,
  MessageRole,
  MessageStatus,
} from '@shared/chat';
import { getDb } from '@main/infrastructure/database/connection';

import { conversations } from './conversationTable';
import type {
  ConversationRecord,
  NewConversationRecord,
} from './conversationTable';
import { messages } from './messageTable';
import type { MessageRecord, NewMessageRecord } from './messageTable';

export interface NewMessageInput {
  conversationId: string;
  role: MessageRole;
  text: string;
  status: MessageStatus;
  reasoning?: string;
  error?: string;
  model?: ModelRef;
  mode?: ConversationMode;
}

/* ------------------------------------------------------------------ */
/* 行 → 领域模型                                                       */
/* ------------------------------------------------------------------ */

function toMode(value: string): ConversationMode {
  return value === 'agent' ? 'agent' : 'chat';
}

function toRole(value: string): MessageRole {
  return value === 'assistant' ? 'assistant' : 'user';
}

function toStatus(value: string): MessageStatus {
  switch (value) {
    case 'streaming':
    case 'error':
    case 'aborted':
      return value;
    default:
      return 'done';
  }
}

function toModelRef(
  providerId: string | null,
  modelId: string | null,
): ModelRef | undefined {
  return providerId && modelId ? { providerId, modelId } : undefined;
}

function toConversation(row: ConversationRecord): Conversation {
  return {
    id: row.id,
    title: row.title,
    lastMode: toMode(row.lastMode),
    lastModel: toModelRef(row.lastModelProviderId, row.lastModelId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: MessageRecord): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: toRole(row.role),
    text: row.content,
    reasoning: row.reasoning ?? undefined,
    status: toStatus(row.status),
    error: row.error ?? undefined,
    model: toModelRef(row.modelProviderId, row.modelId),
    mode: toMode(row.mode),
    createdAt: row.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Repo                                                                */
/* ------------------------------------------------------------------ */

export const conversationRepo = {
  createConversation(input: {
    title: string;
    lastMode?: ConversationMode;
  }): Conversation {
    const now = Date.now();
    const row = getDb()
      .insert(conversations)
      .values({
        id: randomUUID(),
        title: input.title,
        lastMode: input.lastMode ?? 'chat',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return toConversation(row);
  },

  getConversation(id: string): Conversation | null {
    const row = getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .get();

    return row ? toConversation(row) : null;
  },

  listConversations(): Conversation[] {
    return getDb()
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .all()
      .map(toConversation);
  },

  /** 更新会话的活跃时间，并按需记录上次使用的模式 / 模型 */
  touchConversation(
    id: string,
    patch?: { lastMode?: ConversationMode; lastModel?: ModelRef },
  ): void {
    const values: Partial<NewConversationRecord> = { updatedAt: Date.now() };

    if (patch?.lastMode) values.lastMode = patch.lastMode;
    if (patch?.lastModel) {
      values.lastModelProviderId = patch.lastModel.providerId;
      values.lastModelId = patch.lastModel.modelId;
    }

    getDb()
      .update(conversations)
      .set(values)
      .where(eq(conversations.id, id))
      .run();
  },

  /** 会话内 seq 在同一个事务里分配，避免并发写入得到相同序号 */
  addMessage(input: NewMessageInput): ChatMessage {
    const now = Date.now();

    const row = getDb().transaction((tx) => {
      const last = tx
        .select({
          seq: sql<number>`coalesce(max(${messages.seq}), 0)`,
        })
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .get();

      return tx
        .insert(messages)
        .values({
          id: randomUUID(),
          conversationId: input.conversationId,
          seq: (last?.seq ?? 0) + 1,
          role: input.role,
          content: input.text,
          reasoning: input.reasoning ?? null,
          status: input.status,
          mode: input.mode ?? 'chat',
          error: input.error ?? null,
          modelProviderId: input.model?.providerId ?? null,
          modelId: input.model?.modelId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    });

    return toMessage(row);
  },

  updateMessage(id: string, patch: Partial<ChatMessage>): ChatMessage | null {
    const values: Partial<NewMessageRecord> = { updatedAt: Date.now() };

    if (patch.text !== undefined) values.content = patch.text;
    if (patch.reasoning !== undefined) {
      values.reasoning = patch.reasoning ?? null;
    }
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.error !== undefined) values.error = patch.error ?? null;
    if (patch.model !== undefined) {
      values.modelProviderId = patch.model?.providerId ?? null;
      values.modelId = patch.model?.modelId ?? null;
    }

    const row = getDb()
      .update(messages)
      .set(values)
      .where(eq(messages.id, id))
      .returning()
      .get();

    return row ? toMessage(row) : null;
  },

  listMessages(conversationId: string): ChatMessage[] {
    return getDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.seq))
      .all()
      .map(toMessage);
  },
};
