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
  /** 返回 false 表示未接收，编辑器会保留内容 */
  onSend: (payload: ChatEditorSubmitPayload) => void | boolean;
  onContentChange?: (text: string) => void;
}
