import { useMemo, useState } from 'react';

import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';

import { CaretRightIcon } from '@phosphor-icons/react/dist/icons/CaretRight';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/icons/Trash';

import type {
  ProviderId,
  ProviderRegion,
  ProviderView,
} from '@shared/api/provider';
import { ProviderCreateDrawer } from '../components/ProviderCreateDrawer';
import { ProviderDetailDrawer } from '../components/ProviderDetailDrawer';
import { useProviders } from '../useProviders';

const REGION_LABEL: Record<ProviderRegion, string> = {
  international: '国际模型',
  domestic: '国产模型',
};

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

/** 供应商列表项：头像 + 名称/模型数 + 地区徽标 + 删除 + 箭头 */
function ProviderRow({
  provider,
  selected,
  onSelect,
  onDelete,
}: {
  provider: ProviderView;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    // 行内含删除用 ActionIcon（也是 button），HTML 不允许 button 嵌套 button，
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
        border: '1px solid var(--mantine-color-gray-3)',
        // 选中态用内阴影画第二圈，避免 2px border 挤动布局
        boxShadow: selected
          ? 'inset 0 0 0 1px var(--mantine-color-blue-6)'
          : undefined,
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
            <Text size="sm" c="dimmed">
              {provider.models.length} 个模型
            </Text>
          </Stack>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Badge
            variant="light"
            color={provider.region === 'domestic' ? 'blue' : 'gray'}
          >
            {REGION_LABEL[provider.region]}
          </Badge>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`删除 ${provider.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
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
  const [drawerMode, setDrawerMode] = useState<'add' | 'edit'>('add');
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
    setDrawerMode('add');
    setDrawerOpen(true);
  };

  const openEdit = (provider: ProviderView) => {
    setDrawerMode('edit');
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
              key={provider.id}
              provider={provider}
              selected={provider.id === selectedId}
              onSelect={() => openEdit(provider)}
              onDelete={() => setDeleteTarget(provider)}
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

      {/* 新建抽屉：key 保证每次打开都是干净表单 */}
      {drawerMode === 'add' && (
        <ProviderCreateDrawer
          key={`add-${drawerOpen}`}
          opened={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCreate={create}
        />
      )}

      {/* 编辑抽屉：key 保证每次打开 / 切换供应商都重挂载（表单从服务端数据初始化） */}
      {drawerMode === 'edit' && selected && (
        <ProviderDetailDrawer
          key={`edit-${selected.id}-${drawerOpen}`}
          provider={selected}
          opened={drawerOpen}
          onClose={() => setDrawerOpen(false)}
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
