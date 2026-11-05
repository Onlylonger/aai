import { useState } from 'react';

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  NumberInput,
  PasswordInput,
  Paper,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { z } from 'zod';

import { CheckIcon } from '@phosphor-icons/react/dist/icons/Check';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/icons/PencilSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/icons/Trash';
import { XIcon } from '@phosphor-icons/react/dist/icons/X';

import type {
  ProviderId,
  ProviderUpdate,
  ProviderView,
} from '@shared/api/provider';

/* ------------------------------------------------------------------ */
/* 表单定义：schema / 表单值 / 视图转换                                  */
/* ------------------------------------------------------------------ */

/**
 * 表单值 = ProviderView 的可编辑投影。
 *
 * - apiKey 恒为「输入缓冲」：空串表示不修改已保存的密钥
 * - models 是 string[]（服务端存 JSON 字符串，序列化收口在 main 侧）
 */
interface ProviderFormValues {
  baseUrl: string;
  apiKey: string;
  defaultModel: string | null;
  temperature: number;
  maxOutputTokens: number;
  enabled: boolean;
  models: string[];
}

const providerFormSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^https?:\/\//.test(v),
      '请输入合法的 URL，或留空使用协议默认地址',
    ),
  apiKey: z.string(),
  defaultModel: z.string().nullable(),
  temperature: z.number().min(0, '不能小于 0').max(2, '不能大于 2'),
  maxOutputTokens: z
    .number()
    .int('必须是整数')
    .min(1, '至少为 1')
    .max(1_000_000, '过大了'),
  enabled: z.boolean(),
  models: z.array(z.string().min(1, '模型 ID 不能为空')),
});

/** 服务端视图 → 表单草稿（apiKey 永远清空输入缓冲） */
function toFormValues(view: ProviderView): ProviderFormValues {
  return {
    baseUrl: view.baseUrl ?? '',
    apiKey: '',
    defaultModel: view.defaultModel,
    temperature: view.temperature,
    maxOutputTokens: view.maxOutputTokens,
    enabled: view.enabled,
    models: [...view.models],
  };
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

type TabValue = 'basic' | 'models' | 'test';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'basic', label: '基本配置' },
  { value: 'models', label: '模型列表' },
  { value: 'test', label: '连接测试' },
];

interface ProviderDetailDrawerProps {
  provider: ProviderView;
  opened: boolean;
  onClose: () => void;
  /** 提交 PATCH，main 返回最新视图（useProviders.update） */
  onUpdate: (patch: ProviderUpdate) => Promise<ProviderView>;
  /** 连接测试：main 侧发一次极小的真实请求，失败即 reject */
  onTest: (id: ProviderId) => Promise<void>;
}

/**
 * 编辑供应商详情抽屉。
 *
 * 表单草稿在挂载时用 initialValues 初始化（父组件用 key={providerId+open}
 * 控制「每次打开 / 切换供应商都重挂载」），因此不需要 effect 做表单同步——
 * 这是刻意规避 @mantine/form 的 form 对象每渲染必变导致的 setState-in-effect 死循环。
 */
export function ProviderDetailDrawer({
  provider,
  opened,
  onClose,
  onUpdate,
  onTest,
}: ProviderDetailDrawerProps) {
  const [tab, setTab] = useState<TabValue>('basic');

  // 纯 UI 的瞬态缓冲（不是表单数据，不进 useForm）
  const [newModel, setNewModel] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const form = useForm<ProviderFormValues>({
    initialValues: toFormValues(provider),
    // Mantine 9 用 Standard Schema 规范接校验库，zod v4 原生实现该规范；
    // 本表单校验全部是同步规则，用 sync: true 拿到即时错误
    validate: schemaResolver(providerFormSchema, { sync: true }),
  });

  /** 基本配置保存：form.onSubmit 负责跑 zod 校验 + 收集 values + submitting 状态 */
  const handleSave = form.onSubmit(async (values) => {
    const next = await onUpdate({
      id: provider.id,
      enabled: values.enabled,
      baseUrl: values.baseUrl.trim(),
      apiKey: values.apiKey.trim() ? values.apiKey.trim() : undefined,
      defaultModel: values.defaultModel,
      temperature: values.temperature,
      maxOutputTokens: values.maxOutputTokens,
    });
    form.setValues(toFormValues(next));
    form.resetDirty();
  });

  /* 模型 tab 的增删改是「即时持久化」语义：每次操作直接 PATCH，
     然后用服务端返回值回填 models / defaultModel（删除默认模型时
     服务端会回落到第一个模型，必须以响应为准）。 */

  const addModel = async () => {
    const modelId = newModel.trim();
    if (!modelId) {
      setAddError('请输入模型 ID');
      return;
    }
    if (form.values.models.includes(modelId)) {
      setAddError('模型已存在');
      return;
    }
    const next = await onUpdate({
      id: provider.id,
      models: [...form.values.models, modelId],
    });
    form.setValues({ models: next.models, defaultModel: next.defaultModel });
    setNewModel('');
    setAddError(null);
  };

  const renameModel = async (oldId: string) => {
    const nextId = editingValue.trim();
    setEditingId(null);
    if (!nextId || nextId === oldId) return;
    if (form.values.models.includes(nextId)) return;
    const next = await onUpdate({
      id: provider.id,
      models: form.values.models.map((m) => (m === oldId ? nextId : m)),
      // 默认模型被重命名时同步跟进；undefined 表示保留现值由服务端校验
      defaultModel: form.values.defaultModel === oldId ? nextId : undefined,
    });
    form.setValues({ models: next.models, defaultModel: next.defaultModel });
  };

  const removeModel = async (modelId: string) => {
    const next = await onUpdate({
      id: provider.id,
      models: form.values.models.filter((m) => m !== modelId),
    });
    form.setValues({ models: next.models, defaultModel: next.defaultModel });
  };

  const setDefaultModel = async (modelId: string) => {
    const next = await onUpdate({ id: provider.id, defaultModel: modelId });
    form.setValues({ models: next.models, defaultModel: next.defaultModel });
  };

  /** 连接测试：main 侧发一次极小的真实请求，成功/失败都落到结果条 */
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await onTest(provider.id);
      setTestResult({ ok: true, message: '连接成功，鉴权与模型调用均正常。' });
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={560}
      title={
        <Group justify="space-between" wrap="nowrap" w="100%" gap="md">
          <Box>
            <Title order={5}>{provider.name}</Title>
            <Text size="xs" c="dimmed">
              供应商详细配置
            </Text>
          </Box>
          <Badge variant="light" color={provider.enabled ? 'green' : 'gray'}>
            {provider.enabled ? '已启用' : '未启用'}
          </Badge>
        </Group>
      }
    >
      <Stack gap="md">
        <SegmentedControl
          w="100%"
          data={TABS}
          value={tab}
          onChange={(value) => setTab(value as TabValue)}
        />

        {tab === 'basic' && (
          <Stack gap="md">
            <Text fw={700}>API 接口配置</Text>
            <TextInput
              label="API Base URL"
              placeholder="使用协议默认地址"
              {...form.getInputProps('baseUrl')}
            />
            <Stack gap={4}>
              <PasswordInput
                label="API Key"
                placeholder={
                  provider.hasApiKey ? '已保存（留空则不修改）' : '输入 API Key'
                }
                {...form.getInputProps('apiKey')}
              />
              <Text size="xs" c="dimmed">
                密钥由系统安全保存（safeStorage 加密），页面只展示脱敏状态。
              </Text>
            </Stack>
            <Select
              label="默认调用模型"
              data={form.values.models}
              placeholder={
                form.values.models.length === 0
                  ? '请先在「模型列表」中添加'
                  : undefined
              }
              disabled={form.values.models.length === 0}
              allowDeselect={false}
              {...form.getInputProps('defaultModel')}
            />

            <Divider />

            <Text fw={700}>模型调用参数</Text>
            <Group justify="space-between">
              <Text size="sm">Temperature</Text>
              <Text fw={700}>{form.values.temperature.toFixed(1)}</Text>
            </Group>
            <Slider
              min={0}
              max={2}
              step={0.1}
              label={(value) => value.toFixed(1)}
              {...form.getInputProps('temperature')}
            />
            <NumberInput
              label="最大输出 Token"
              min={1}
              {...form.getInputProps('maxOutputTokens')}
            />

            <Divider />

            <Group justify="space-between" wrap="nowrap">
              <Box>
                <Text size="sm">启用供应商</Text>
                <Text size="xs" c="dimmed">
                  允许聊天和模型管理模块调用
                </Text>
              </Box>
              <Switch
                aria-label="启用供应商"
                {...form.getInputProps('enabled', { type: 'checkbox' })}
              />
            </Group>

            {form.isDirty() && (
              <Text size="xs" c="orange">
                有未保存的更改
              </Text>
            )}
            <Button
              color="dark"
              radius="md"
              disabled={!form.isDirty()}
              loading={form.submitting}
              onClick={() => void handleSave()}
            >
              保存配置
            </Button>
          </Stack>
        )}

        {tab === 'models' && (
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={700}>可用模型</Text>
              <Badge variant="light" color="gray">
                {form.values.models.length} 个
              </Badge>
            </Group>

            {form.values.models.map((modelId) => (
              <Paper key={modelId} withBorder radius="md" p="md">
                {editingId === modelId ? (
                  <Group gap="xs" wrap="nowrap">
                    <TextInput
                      flex={1}
                      value={editingValue}
                      onChange={(event) =>
                        setEditingValue(event.currentTarget.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void renameModel(modelId);
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <ActionIcon
                      variant="light"
                      color="blue"
                      aria-label="确认"
                      onClick={() => void renameModel(modelId)}
                    >
                      <CheckIcon size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="gray"
                      aria-label="取消"
                      onClick={() => setEditingId(null)}
                    >
                      <XIcon size={16} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <>
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Box>
                        <Group gap="xs">
                          <Text fw={600}>{modelId}</Text>
                          {form.values.defaultModel === modelId ? (
                            <Badge size="sm" variant="light" color="green">
                              当前默认
                            </Badge>
                          ) : (
                            <Badge size="sm" variant="light" color="gray">
                              可选
                            </Badge>
                          )}
                        </Group>
                        <Text size="sm" c="dimmed" mt={4}>
                          模型标识：{modelId}
                        </Text>
                      </Box>
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={`编辑 ${modelId}`}
                          onClick={() => {
                            setEditingId(modelId);
                            setEditingValue(modelId);
                          }}
                        >
                          <PencilSimpleIcon size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`删除 ${modelId}`}
                          onClick={() => void removeModel(modelId)}
                        >
                          <TrashIcon size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    {form.values.defaultModel !== modelId && (
                      <Group justify="flex-end" mt="sm">
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => void setDefaultModel(modelId)}
                        >
                          设为默认
                        </Button>
                      </Group>
                    )}
                  </>
                )}
              </Paper>
            ))}

            {form.values.models.length === 0 && (
              <Text c="dimmed" size="sm">
                暂无模型，添加一个吧。
              </Text>
            )}

            <Stack gap={4}>
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  flex={1}
                  placeholder="输入模型 ID，如 gpt-5.1"
                  value={newModel}
                  onChange={(event) => {
                    setNewModel(event.currentTarget.value);
                    setAddError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addModel();
                  }}
                />
                <Button
                  color="dark"
                  leftSection={<PlusIcon size={14} />}
                  onClick={() => void addModel()}
                >
                  添加
                </Button>
              </Group>
              {addError && (
                <Text size="xs" c="red">
                  {addError}
                </Text>
              )}
            </Stack>
          </Stack>
        )}

        {tab === 'test' && (
          <Stack gap="md">
            <Text fw={700}>API 连通性测试</Text>
            <Paper withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                即将测试的配置
              </Text>
              <Text fw={600} mt={4}>
                {provider.name} / {form.values.defaultModel ?? '未选择模型'}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {form.values.baseUrl
                  ? `${form.values.baseUrl}/chat/completions`
                  : '协议默认地址 /chat/completions'}
              </Text>
            </Paper>

            <Group justify="space-between">
              <Text fw={600}>测试方式</Text>
              <Badge variant="light" color="blue">
                真实 API 请求
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              测试会验证鉴权、模型权限、对话响应及 Token 用量。
            </Text>

            <Button
              color="dark"
              radius="md"
              loading={testing}
              onClick={() => void runTest()}
            >
              开始连接测试
            </Button>
            {testResult && (
              <Alert
                variant="light"
                color={testResult.ok ? 'green' : 'red'}
                title={testResult.ok ? '连接成功' : '连接失败'}
              >
                {testResult.message}
              </Alert>
            )}
            <Text size="xs" c="dimmed">
              测试会向当前默认模型发送一次极小的真实请求（prompt: ping），
              以验证 API Key 与网关连通性。
            </Text>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
