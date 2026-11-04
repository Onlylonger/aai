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

/** 工具输出预览：截断到 240 字符，避免大段 JSON 撑爆卡片 */
function preview(value: unknown): string {
  try {
    const text =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return text.length > 240 ? `${text.slice(0, 240)}…` : text;
  } catch {
    return String(value);
  }
}

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
              <Stack key={step.id} gap={2}>
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Badge size="xs" variant="light" color={stepMeta.color}>
                    {stepMeta.label}
                  </Badge>
                  <Text size="xs">
                    {step.title}
                    {step.toolName ? ` · ${step.toolName}` : ''}
                  </Text>
                </Group>

                {step.type === 'tool' && step.output !== undefined && (
                  <Text
                    size="xs"
                    c="dimmed"
                    ml={6}
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {preview(step.output)}
                  </Text>
                )}

                {step.error && (
                  <Text size="xs" c="red" ml={6}>
                    {step.error}
                  </Text>
                )}
              </Stack>
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
