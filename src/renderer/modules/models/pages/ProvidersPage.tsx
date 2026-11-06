import { useMemo, useState, type SyntheticEvent } from 'react';

import {
  ActionIcon,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';

import { CaretRightIcon } from '@phosphor-icons/react/dist/icons/CaretRight';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/icons/PencilSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/icons/Trash';

import type {
  ProviderId,
  ProviderUpdate,
  ProviderView,
} from '@shared/api/provider';
import { ProviderDetailDrawer } from '../components/ProviderDetailDrawer';
import { MODEL_SUGGESTION_IDS } from '../modelSuggestions';
import { useProviders } from '../useProviders';

/** 顶部统计块 */
function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <Box>
      <Text fz={28} fw={700} lh={1.2}>
        {value}
      </Text>
      <Text size="sm" c="dimmed" mt={4}>
        {label}
      </Text>
    </Box>
  );
}

/** 供应商列表项：头像 + 名称/默认模型 + 启用开关 + 编辑 + 删除 + 箭头 */
function ProviderRow({
  provider,
  selected,
  onSelect,
  onDelete,
  onUpdate,
}: {
  provider: ProviderView;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (patch: ProviderUpdate) => Promise<unknown>;
}) {
  // 行内的下拉 / 开关不应触发行点击（打开详情）
  const stopRowEvents = (event: SyntheticEvent) => {
    event.stopPropagation();
  };

  // 默认模型输入：本地草稿，选中候选后立即应用
  const [modelInput, setModelInput] = useState(provider.defaultModel ?? '');

  const applyDefaultModel = (input: string) => {
    const modelId = input.trim();
    if (!modelId || modelId === provider.defaultModel) return;

    // 输入的模型不在列表里时，一并补进模型列表
    const models = provider.models.includes(modelId)
      ? provider.models
      : [...provider.models, modelId];

    setModelInput(modelId);
    void onUpdate({ id: provider.id, models, defaultModel: modelId });
  };

  // 候选 = 已配置的模型 + 常见模型 ID（选中未配置的会自动加入列表）
  const modelOptions = [
    ...new Set([...provider.models, ...MODEL_SUGGESTION_IDS]),
  ];

  return (
    // 行内含 ActionIcon / Autocomplete / Switch，HTML 不允许 button 嵌套 button，
    // 所以容器降级为 div，补 role/tabIndex/键盘激活保持可访问性
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
      w="100%"
      p="md"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        // 蓝框表示已启用；未启用保持灰色边框
        border: `1px solid ${
          provider.enabled
            ? 'var(--mantine-color-blue-6)'
            : 'var(--mantine-color-gray-3)'
        }`,
        background: selected
          ? 'var(--mantine-color-body)'
          : 'var(--mantine-color-gray-0)',
      }}
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
                  data={modelOptions}
                  value={modelInput}
                  onChange={setModelInput}
                  onOptionSubmit={(value) => applyDefaultModel(value)}
                  placeholder="选择或输入模型"
                  limit={10}
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

export function ProvidersPage() {
  const { providers, loading, create, update, remove, test } = useProviders();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<ProviderId | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProviderView | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers;
    return providers.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [providers, search]);

  const enabledCount = providers.filter((p) => p.enabled).length;
  const modelTotal = providers.reduce((sum, p) => sum + p.models.length, 0);

  const selected = providers.find((p) => p.id === selectedId) ?? null;

  const openAdd = () => {
    setSelectedId(null);
    setDrawerOpen(true);
  };

  const openEdit = (provider: ProviderView) => {
    setSelectedId(provider.id);
    setDrawerOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setDrawerOpen(false);
      }
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ScrollArea h="100%" p="md">
      <Paper withBorder radius="lg" p="xl" maw={980} mx="auto">
        {/* 头部：标题 + 添加按钮 */}
        <Group justify="space-between" align="flex-start" wrap="nowrap" mb="lg">
          <Box>
            <Title order={4}>模型供应商</Title>
            <Text size="sm" c="dimmed" mt={4}>
              管理模型服务商、API 配置与连接状态
            </Text>
          </Box>
          <Button
            radius="xl"
            color="dark"
            leftSection={<PlusIcon size={16} weight="bold" />}
            onClick={openAdd}
          >
            添加供应商
          </Button>
        </Group>

        {/* 统计 */}
        <Group gap="xl" mb="lg">
          <StatBlock value={providers.length} label="供应商总数" />
          <StatBlock value={enabledCount} label="已启用" />
          <StatBlock value={modelTotal} label="模型总数" />
        </Group>

        <Divider mb="lg" />

        {/* 列表 */}
        <Text fw={600} mb="sm">
          供应商列表
        </Text>
        <TextInput
          placeholder="搜索供应商..."
          leftSection={<MagnifyingGlassIcon size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          mb="md"
        />

        <Stack gap="sm">
          {filtered.map((provider) => (
            <ProviderRow
              // 默认模型变化时重挂载，重置行内的输入缓冲
              key={`${provider.id}-${provider.defaultModel ?? ''}`}
              provider={provider}
              selected={provider.id === selectedId}
              onSelect={() => openEdit(provider)}
              onDelete={() => setDeleteTarget(provider)}
              onUpdate={update}
            />
          ))}
          {filtered.length === 0 && (
            <Text c="dimmed" size="sm" ta="center" py="xl">
              {loading
                ? '加载中...'
                : providers.length === 0
                  ? '还没有供应商，点击右上角「添加供应商」创建一个吧'
                  : '没有匹配的供应商'}
            </Text>
          )}
        </Stack>
      </Paper>

      {/* 新建 / 编辑共用一个抽屉；key 保证每次打开 / 切换对象都重挂载 */}
      {drawerOpen && (
        <ProviderDetailDrawer
          key={`${selectedId ?? 'new'}-${String(drawerOpen)}`}
          provider={selected}
          opened={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCreate={create}
          onUpdate={update}
          onTest={test}
        />
      )}

      {/* 删除二次确认 */}
      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="删除供应商"
        size="sm"
        centered
      >
        <Text size="sm">
          确定要删除「{deleteTarget?.name}」吗？删除后它将不再出现在列表中。
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button
            color="red"
            loading={deleting}
            onClick={() => void confirmDelete()}
          >
            删除
          </Button>
        </Group>
      </Modal>
    </ScrollArea>
  );
}
