import {
  ActionIcon,
  Box,
  Group,
  Image,
  Paper,
  Text,
  Tooltip,
} from '@mantine/core';

import { FileTextIcon } from '@phosphor-icons/react/dist/icons/FileText';
import { XIcon } from '@phosphor-icons/react/dist/icons/X';

import type { ChatAttachment } from './types/attachment';

interface AttachmentItemProps {
  attachment: ChatAttachment;
  disabled?: boolean;
  onRemove: (id: string) => void;
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentItem({
  attachment,
  disabled = false,
  onRemove,
}: AttachmentItemProps) {
  const isImage = attachment.type === 'image';

  return (
    <Paper className="chat-attachment-item" withBorder radius="md" p="xs">
      <Group gap="xs" wrap="nowrap">
        {isImage && attachment.previewUrl ? (
          <Image
            src={attachment.previewUrl}
            alt={attachment.name}
            w={44}
            h={44}
            fit="cover"
            radius="sm"
          />
        ) : (
          <Box className="chat-attachment-icon">
            <FileTextIcon size={24} />
          </Box>
        )}

        <Box className="chat-attachment-info">
          <Tooltip label={attachment.name}>
            <Text size="xs" fw={500} lineClamp={1}>
              {attachment.name}
            </Text>
          </Tooltip>

          <Text size="xs" c="dimmed">
            {formatFileSize(attachment.size)}
          </Text>
        </Box>

        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          disabled={disabled}
          onClick={() => onRemove(attachment.id)}
          aria-label={`删除附件 ${attachment.name}`}
        >
          <XIcon size={16} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
