import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChatAttachment, LocalAttachment } from './types/attachment';

const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const ACCEPTED_TYPES = [
  'image/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
];

function getFileType(file: File): ChatAttachment['type'] {
  return file.type.startsWith('image/') ? 'image' : 'file';
}

function createAttachment(file: File): ChatAttachment {
  const type = getFileType(file);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    type,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    previewUrl: type === 'image' ? URL.createObjectURL(file) : undefined,
    status: 'selected',
  };
}

function getFileKey(file: File) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

export function useAttachments() {
  const [items, setItems] = useState<LocalAttachment[]>([]);

  const [error, setError] = useState<string | null>(null);

  const itemsRef = useRef(items);

  // 同步当前附件引用，供清理和重复检查使用
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // 组件卸载时释放图片预览 URL
  useEffect(() => {
    return () => {
      itemsRef.current.forEach(({ attachment }) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, []);

  const commitItems = useCallback((next: LocalAttachment[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);

      const next = [...itemsRef.current];

      const existingKeys = new Set(next.map(({ file }) => getFileKey(file)));

      let errorMessage: string | null = null;

      for (const file of files) {
        if (next.length >= MAX_FILES) {
          errorMessage = `最多只能添加 ${MAX_FILES} 个附件`;
          break;
        }

        if (file.size > MAX_FILE_SIZE) {
          errorMessage = `${file.name} 超过 20MB 限制`;
          continue;
        }

        const key = getFileKey(file);

        if (existingKeys.has(key)) {
          continue;
        }

        existingKeys.add(key);

        next.push({
          attachment: createAttachment(file),
          file,
        });
      }

      commitItems(next);
      setError(errorMessage);
    },
    [commitItems],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      const target = itemsRef.current.find((item) => item.attachment.id === id);

      if (target?.attachment.previewUrl) {
        URL.revokeObjectURL(target.attachment.previewUrl);
      }

      commitItems(itemsRef.current.filter((item) => item.attachment.id !== id));

      setError(null);
    },
    [commitItems],
  );

  // 清空附件
  const clearAttachments = useCallback(() => {
    itemsRef.current.forEach(({ attachment }) => {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });

    commitItems([]);
    setError(null);
  }, [commitItems]);

  // 获取附件元数据
  const getAttachments = useCallback(() => {
    return itemsRef.current.map(({ attachment }) => attachment);
  }, []);

  // 获取本地文件
  const getFiles = useCallback(() => {
    return itemsRef.current.map(({ file }) => file);
  }, []);

  return {
    items,
    error,
    accept: ACCEPTED_TYPES.join(','),
    addFiles,
    removeAttachment,
    clearAttachments,
    getAttachments,
    getFiles,
  };
}
