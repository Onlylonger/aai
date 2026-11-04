import { useMemo, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';

import type { ProviderId, ProviderView } from '@shared/api/provider';

import { ProviderDetailDrawer } from '../components/ProviderDetailDrawer';
import { ProviderRow } from '../components/ProviderRow';
import { useProviderStore } from '../providerStore';

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

export function ProvidersPage() {
  const { providers, loading, error, create, update, remove, test } =
    useProviderStore();

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

        {error && (
          <Alert color="red" variant="light" title="加载供应商失败" mb="md">
            {error}
          </Alert>
        )}

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

          {loading && providers.length === 0 && (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          )}

          {!loading && filtered.length === 0 && (
            <Text c="dimmed" size="sm" ta="center" py="xl">
              {providers.length === 0
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
