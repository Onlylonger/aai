import type { ReactNode } from 'react';
import { ActionIcon, Group, Tooltip } from '@mantine/core';

import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/icons/PaperPlaneTilt';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';
import { StopIcon } from '@phosphor-icons/react/dist/icons/Stop';

interface ChatToolbarProps {
  disabled?: boolean;
  canSend?: boolean;
  onSend: () => void;
  onAddAttachment?: () => void;
  /** 左侧额外内容，如模型选择器 */
  leftSection?: ReactNode;
  /** 是否正在生成，生成中显示停止按钮 */
  running?: boolean;
  onStop?: () => void;
}

export function ChatToolbar({
  disabled = false,
  canSend = false,
  onSend,
  onAddAttachment,
  leftSection,
  running = false,
  onStop,
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
        {leftSection}
      </Group>

      {running ? (
        <Tooltip label="停止生成">
          <ActionIcon
            variant="filled"
            color="gray"
            size="lg"
            radius="md"
            onClick={onStop}
            aria-label="停止生成"
          >
            <StopIcon size={18} weight="fill" />
          </ActionIcon>
        </Tooltip>
      ) : (
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
      )}
    </Group>
  );
}
