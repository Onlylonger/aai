import { useState, type SyntheticEvent } from 'react';

import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Box,
  Group,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from '@mantine/core';

import { CaretRightIcon } from '@phosphor-icons/react/dist/icons/CaretRight';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/icons/PencilSimple';
import { TrashIcon } from '@phosphor-icons/react/dist/icons/Trash';

import type { ProviderUpdate, ProviderView } from '@shared/api/provider';

import classes from './ProviderRow.module.css';

interface ProviderRowProps {
  provider: ProviderView;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (patch: ProviderUpdate) => Promise<unknown>;
}

/**
 * 供应商列表项：头像 + 名称/默认模型 + 启用开关 + 编辑 + 删除 + 箭头。
 *
 * 行内含 ActionIcon / Autocomplete / Switch，HTML 不允许 button 嵌套 button，
 * 所以容器用 UnstyledButton 渲染为 div，并补 role/tabIndex/键盘激活保持可访问性。
 */
export function ProviderRow({
  provider,
  selected,
  onSelect,
  onDelete,
  onUpdate,
}: ProviderRowProps) {
  // 行内的下拉 / 开关不应触发行点击（打开详情）
  const stopRowEvents = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  // 默认模型输入：本地草稿，选中候选后立即应用
  const [modelInput, setModelInput] = useState(provider.defaultModel ?? '');

  const applyDefaultModel = (input: string) => {
    const modelId = input.trim();
    if (
      !modelId ||
      modelId === provider.defaultModel ||
      !provider.models.includes(modelId)
    ) {
      return;
    }

    setModelInput(modelId);
    void onUpdate({ id: provider.id, defaultModel: modelId });
  };

  return (
    <UnstyledButton
      component="div"
      role="button"
      tabIndex={0}
      aria-label={`打开 ${provider.name} 详情`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={classes.row}
      p="md"
      data-enabled={provider.enabled}
      data-selected={selected}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="md" wrap="nowrap">
          <Avatar
            radius="xl"
            size="lg"
            color="gray"
            variant="light"
            fw={600}
            fz="lg"
          >
            {provider.name.charAt(0)}
          </Avatar>
          <Stack gap={2} align="flex-start">
            <Text fw={600}>{provider.name}</Text>
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" c="dimmed">
                默认模型
              </Text>
              <Box onClick={stopRowEvents} onKeyDown={stopRowEvents}>
                <Autocomplete
                  size="xs"
                  w={200}
                  data={provider.models}
                  value={modelInput}
                  onChange={setModelInput}
                  onOptionSubmit={(value) => applyDefaultModel(value)}
                  disabled={provider.models.length === 0}
                  placeholder={
                    provider.models.length === 0 ? '暂无模型' : '选择或输入模型'
                  }
                  aria-label={`${provider.name} 的默认模型`}
                />
              </Box>
              <Text size="sm" c="dimmed">
                · {provider.models.length} 个模型
              </Text>
            </Group>
          </Stack>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Box onClick={stopRowEvents} onKeyDown={stopRowEvents}>
            <Switch
              size="sm"
              checked={provider.enabled}
              onChange={(event) => {
                void onUpdate({
                  id: provider.id,
                  enabled: event.currentTarget.checked,
                });
              }}
              aria-label={`启用 ${provider.name}`}
            />
          </Box>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`编辑 ${provider.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            onKeyDown={stopRowEvents}
          >
            <PencilSimpleIcon size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`删除 ${provider.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            onKeyDown={stopRowEvents}
          >
            <TrashIcon size={16} />
          </ActionIcon>
          <CaretRightIcon
            size={16}
            style={{ color: 'var(--mantine-color-dimmed)' }}
          />
        </Group>
      </Group>
    </UnstyledButton>
  );
}
