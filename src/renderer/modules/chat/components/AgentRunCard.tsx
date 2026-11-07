import { useState } from 'react';

import {
  Badge,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';

import { CaretRightIcon } from '@phosphor-icons/react/dist/icons/CaretRight';

import type { AgentStepStatus } from '@shared/api/agent';

import type { RunState } from '../store/chatStore';

const RUN_META: Record<RunState['status'], { label: string; color: string }> = {
  running: { label: '执行中', color: 'blue' },
  done: { label: '已完成', color: 'green' },
  error: { label: '失败', color: 'red' },
  aborted: { label: '已取消', color: 'gray' },
};

const STEP_META: Record<AgentStepStatus, { label: string; color: string }> = {
  pending: { label: '等待', color: 'gray' },
  running: { label: '进行中', color: 'blue' },
  done: { label: '完成', color: 'green' },
  error: { label: '失败', color: 'red' },
  cancelled: { label: '取消', color: 'gray' },
};

/**
 * Agent 执行卡片：折叠展示计划与步骤，不污染普通聊天正文。
 * 默认在运行中展开，结束后可手动折叠。
 */
export function AgentRunCard({ run }: { run: RunState }) {
  const [opened, setOpened] = useState(run.status === 'running');
  const meta = RUN_META[run.status];

  return (
    <Paper withBorder radius="md" p="sm" w="100%" maw="80%">
      <UnstyledButton onClick={() => setOpened((value) => !value)} w="100%">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600}>
              Agent 任务
            </Text>
            <Badge size="xs" variant="light" color={meta.color}>
              {meta.label}
            </Badge>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {run.steps.length} 步
            </Text>
            <CaretRightIcon
              size={14}
              style={{
                transform: opened ? 'rotate(90deg)' : undefined,
                transition: 'transform 120ms ease',
              }}
            />
          </Group>
        </Group>
      </UnstyledButton>

      <Collapse expanded={opened}>
        <Stack gap={6} mt="xs">
          {run.plan && (
            <Text size="xs" c="dimmed">
              计划：{run.plan}
            </Text>
          )}

          {run.steps.map((step) => {
            const stepMeta = STEP_META[step.status];
            return (
              <Group key={step.id} gap="xs" wrap="nowrap" align="flex-start">
                <Badge size="xs" variant="light" color={stepMeta.color}>
                  {stepMeta.label}
                </Badge>
                <Text size="xs">
                  {step.title}
                  {step.toolName ? ` · ${step.toolName}` : ''}
                </Text>
              </Group>
            );
          })}

          {run.error && (
            <Text size="xs" c="red">
              {run.error}
            </Text>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}
