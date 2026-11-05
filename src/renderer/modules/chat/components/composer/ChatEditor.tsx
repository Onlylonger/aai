import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { EditorContent, useEditor } from '@tiptap/react';

import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import HardBreak from '@tiptap/extension-hard-break';
import Placeholder from '@tiptap/extension-placeholder';

import type { Editor, JSONContent } from '@tiptap/core';

import type { ChatEditorProps } from './types/message';

export interface ChatEditorRef {
  focus: () => void;
  clear: () => void;
  send: () => void;
  getEditor: () => Editor | null;
}

export const ChatEditor = forwardRef<ChatEditorRef, ChatEditorProps>(
  function ChatEditor(
    {
      placeholder = '输入消息，使用 @ 引用资源，/ 使用命令...',
      disabled = false,
      canSendWithoutText = false,
      onSend,
      onContentChange,
    },
    ref,
  ) {
    const editorRef = useRef<Editor | null>(null);

    const onSendRef = useRef(onSend);
    const onContentChangeRef = useRef(onContentChange);
    const canSendWithoutTextRef = useRef(canSendWithoutText);

    const placeholderRef = useRef(placeholder);
    const disabledRef = useRef(disabled);

    useEffect(() => {
      onSendRef.current = onSend;
      onContentChangeRef.current = onContentChange;
      canSendWithoutTextRef.current = canSendWithoutText;
      placeholderRef.current = placeholder;
      disabledRef.current = disabled;
    }, [onSend, onContentChange, placeholder, disabled]);

    // 发送消息
    const handleSend = useCallback(() => {
      const editor = editorRef.current;

      if (!editor || disabledRef.current) {
        return;
      }

      const text = editor.getText().trim();

      if (!text && !canSendWithoutTextRef.current) {
        return;
      }

      const content: JSONContent = editor.getJSON();

      const payload = {
        content,
        text,
      };

      // 如果发送回调同步抛出异常，则保留编辑器内容
      // 返回 false 表示本次未被接收（如正在生成中），保留编辑器内容
      if (onSendRef.current(payload) === false) {
        return;
      }

      // 发送成功后清空并聚焦
      editor.commands.clearContent();
      editor.commands.focus();
    }, []);

    const editor = useEditor(
      {
        extensions: [
          Document,
          Paragraph,
          Text,
          HardBreak,

          Placeholder.configure({
            placeholder: () => placeholderRef.current,
            emptyEditorClass: 'is-editor-empty',
            emptyNodeClass: 'is-empty',
            showOnlyWhenEditable: true,
          }),
        ],

        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
            },
          ],
        },

        editable: !disabled,

        immediatelyRender: false,

        editorProps: {
          attributes: {
            class: 'chat-editor',
            spellcheck: 'true',
            'aria-label': '聊天消息输入框',
          },

          handleKeyDown: (_view, event) => {
            // 中文输入法组合输入期间不处理 Enter
            if (event.isComposing || event.keyCode === 229) {
              return false;
            }

            if (event.key !== 'Enter') {
              return false;
            }

            // Shift + Enter：交给 HardBreak 扩展处理
            if (event.shiftKey) {
              return false;
            }

            // Enter：发送消息
            event.preventDefault();

            handleSend();

            return true;
          },
        },

        onCreate: ({ editor }) => {
          editorRef.current = editor;

          onContentChangeRef.current?.(editor.getText());
        },

        onUpdate: ({ editor }) => {
          onContentChangeRef.current?.(editor.getText());
        },

        onDestroy: () => {
          editorRef.current = null;
        },
      },
      [],
    );

    // 同步编辑器禁用状态
    useEffect(() => {
      editor?.setEditable(!disabled);
    }, [editor, disabled]);

    // Placeholder 更新后通知编辑器重新计算 Decorations
    useEffect(() => {
      if (!editor) return;

      editor.view.dispatch(editor.state.tr.setMeta('placeholder-update', true));
    }, [editor, placeholder]);

    // 暴露编辑器方法
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editorRef.current?.commands.focus();
        },

        clear: () => {
          editorRef.current?.commands.clearContent();
        },

        send: handleSend,

        getEditor: () => editorRef.current,
      }),
      [handleSend],
    );

    if (!editor) {
      return null;
    }

    return (
      <div className="chat-editor-wrapper">
        <EditorContent editor={editor} />
      </div>
    );
  },
);
