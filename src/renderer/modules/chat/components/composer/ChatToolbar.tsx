import { ActionIcon, Group, Tooltip } from '@mantine/core';

import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/icons/PaperPlaneTilt';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';

interface ChatToolbarProps {
  disabled?: boolean;
  canSend?: boolean;
  onSend: () => void;
  onAddAttachment?: () => void;
}

export function ChatToolbar({
  disabled = false,
  canSend = false,
  onSend,
  onAddAttachment,
}: ChatToolbarProps) {
  return (
    <Group justify="space-between" align="center">
      <Group gap="xs">
        <Tooltip label="添加附件">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            disabled={disabled || !onAddAttachment}
            onClick={onAddAttachment}
            aria-label="添加附件"
          >
            <PlusIcon size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Tooltip label="发送消息">
        <ActionIcon
          variant="filled"
          color="blue"
          size="lg"
          radius="md"
          disabled={disabled || !canSend}
          onClick={onSend}
          aria-label="发送消息"
        >
          <PaperPlaneTiltIcon size={18} weight="bold" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
