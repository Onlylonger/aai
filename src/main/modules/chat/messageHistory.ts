import type { ModelMessage } from 'ai';

import type { ChatMessage } from '@shared/chat';

/** 把历史消息转换成 AI SDK 的 model messages（只保留可用的正文） */
export function toModelMessages(messages: ChatMessage[]): ModelMessage[] {
  return messages
    .filter((m) => m.text && (m.role === 'user' || m.status === 'done'))
    .map((m) => ({ role: m.role, content: m.text }));
}
