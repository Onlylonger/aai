
import type { JSONContent } from '@tiptap/core';

import type { ChatAttachment } from './attachment';

export interface ChatEditorSubmitPayload {
  content: JSONContent;
  text: string;
}

export interface ChatMessagePayload extends ChatEditorSubmitPayload {
  attachments: ChatAttachment[];

  /**
   * 当前会话中待上传的本地文件。
   * 这是运行时数据，不应该直接 JSON.stringify 持久化。
   */
  files: File[];
}

export interface ChatResource {
  id: string;
  type: 'file' | 'image' | 'knowledge';
  label: string;
}

export interface ChatEditorProps {
  placeholder?: string;
  disabled?: boolean;
  canSendWithoutText?: boolean;
  onSend: (payload: ChatEditorSubmitPayload) => void;
  onContentChange?: (text: string) => void;
}
