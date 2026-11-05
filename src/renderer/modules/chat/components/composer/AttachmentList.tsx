import { Box } from '@mantine/core';

import { AttachmentItem } from './AttachmentItem';

import type { LocalAttachment } from './types/attachment';

interface AttachmentListProps {
  items: LocalAttachment[];
  disabled?: boolean;
  onRemove: (id: string) => void;
}

export function AttachmentList({
  items,
  disabled = false,
  onRemove,
}: AttachmentListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Box className="chat-attachment-list">
      {items.map(({ attachment }) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          disabled={disabled}
          onRemove={onRemove}
        />
      ))}
    </Box>
  );
}
