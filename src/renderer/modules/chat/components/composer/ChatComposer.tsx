import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Box, Text } from '@mantine/core';

import { ChatEditor } from './ChatEditor';
import type { ChatEditorRef } from './ChatEditor';

import { ChatToolbar } from './ChatToolbar';
import { AttachmentList } from './AttachmentList';

import { useAttachments } from './useAttachments';

import type {
  ChatMessagePayload,
  ChatEditorSubmitPayload,
} from './types/message';

import './composer.css';

interface ChatComposerProps {
  onSend: (payload: ChatMessagePayload) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 工具栏左侧额外内容（如模型选择器） */
  toolbarLeft?: ReactNode;
  /** 正在生成：禁止发送，显示停止按钮 */
  running?: boolean;
  onStop?: () => void;
}

export function ChatComposer({
  onSend,
  placeholder = '输入消息，使用 @ 引用资源，/ 使用命令...',
  disabled = false,
  toolbarLeft,
  running = false,
  onStop,
}: ChatComposerProps) {
  const editorRef = useRef<ChatEditorRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [canSend, setCanSend] = useState(false);

  const {
    items,
    error,
    accept,
    addFiles,
    removeAttachment,
    clearAttachments,
    getAttachments,
    getFiles,
  } = useAttachments();

  // 编辑器内容变化
  const handleContentChange = useCallback((text: string) => {
    setCanSend(text.trim().length > 0);
  }, []);

  // 文件选择
  const handleAddAttachment = useCallback(() => {
    if (disabled) return;

    fileInputRef.current?.click();
  }, [disabled]);

  // 文件选择结果
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.currentTarget.files;

      if (files?.length) {
        addFiles(files);
      }

      // 允许重复选择同一个文件
      event.currentTarget.value = '';
    },
    [addFiles],
  );

  // 发送消息
  const handleSend = useCallback(
    (payload: ChatEditorSubmitPayload) => {
      if (running) return false;

      const attachments = getAttachments();
      const files = getFiles();

      onSend({
        ...payload,
        attachments,
        files,
      });

      // 只有回调正常执行后才清空附件
      clearAttachments();
      return true;
    },
    [running, onSend, getAttachments, getFiles, clearAttachments],
  );

  // 点击发送按钮
  const handleClickSend = useCallback(() => {
    editorRef.current?.send();
  }, []);

  const canSendMessage = canSend || items.length > 0;

  return (
    <Box className="chat-composer">
      {/* 附件列表 */}
      <Box className="chat-composer-attachments">
        <AttachmentList
          items={items}
          disabled={disabled}
          onRemove={removeAttachment}
        />

        {error && (
          <Text size="xs" c="red" mt={4}>
            {error}
          </Text>
        )}
      </Box>

      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept}
        hidden
        disabled={disabled}
        onChange={handleFileChange}
      />

      {/* 编辑器 */}
      <ChatEditor
        ref={editorRef}
        placeholder={placeholder}
        disabled={disabled}
        canSendWithoutText={items.length > 0}
        onSend={handleSend}
        onContentChange={handleContentChange}
      />

      {/* 底部工具栏 */}
      <Box className="chat-composer-toolbar">
        <ChatToolbar
          disabled={disabled}
          canSend={canSendMessage && !running}
          onSend={handleClickSend}
          onAddAttachment={handleAddAttachment}
          leftSection={toolbarLeft}
          running={running}
          onStop={onStop}
        />
      </Box>
    </Box>
  );
}
