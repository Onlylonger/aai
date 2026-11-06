import { useEffect, useRef, useState } from 'react';

import {
  ActionIcon,
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  PasswordInput,
  Paper,
  Radio,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';
import { z } from 'zod';

import { CheckIcon } from '@phosphor-icons/react/dist/icons/Check';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/icons/PencilSimple';
import { PlusIcon } from '@phosphor-icons/react/dist/icons/Plus';
import { TrashIcon } from '@phosphor-icons/react/dist/icons/Trash';
import { XIcon } from '@phosphor-icons/react/dist/icons/X';

import type {
  ProviderCreate,
  ProviderId,
  ProviderUpdate,
  ProviderView,
} from '@shared/api/provider';
import { MODEL_SUGGESTIONS } from '../modelSuggestions';

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
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string | null;
  enabled: boolean;
  models: string[];
}

const EMPTY_FORM: ProviderFormValues = {
  name: '',
  baseUrl: '',
  apiKey: '',
  defaultModel: null,
  enabled: false,
  models: [],
};

const providerFormSchema = z.object({
  name: z.string().trim().min(1, '请输入名称').max(100, '名称过长'),
  baseUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^https?:\/\//.test(v),
      '请输入合法的 URL，或留空使用官方默认地址',
    ),
  apiKey: z.string(),
  defaultModel: z.string().nullable(),
  enabled: z.boolean(),
  models: z.array(z.string().min(1, '模型 ID 不能为空')),
});

/** 服务端视图 → 表单草稿（apiKey 永远清空输入缓冲）；null 表示新建 */
function toFormValues(view: ProviderView | null): ProviderFormValues {
  if (!view) return EMPTY_FORM;

  return {
    name: view.name,
    baseUrl: view.baseUrl ?? '',
    apiKey: '',
    defaultModel: view.defaultModel,
    enabled: view.enabled,
    models: [...view.models],
  };
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

type TabValue = 'basic' | 'test';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'basic', label: '基本配置' },
  { value: 'test', label: '连接测试' },
];

interface ProviderDetailDrawerProps {
  /** null 表示新建供应商 */
  provider: ProviderView | null;
  opened: boolean;
  onClose: () => void;
  /** 新建（provider 为 null 时使用） */
  onCreate: (input: ProviderCreate) => Promise<ProviderView>;
  /** 提交 PATCH（编辑时使用） */
  onUpdate: (patch: ProviderUpdate) => Promise<ProviderView>;
  /** 连接测试：main 侧发一次极小的真实请求，失败即 reject */
  onTest: (id: ProviderId) => Promise<void>;
}

/**
 * 供应商详情抽屉（新建 / 编辑共用）。
 *
 * 表单草稿在挂载时用 initialValues 初始化（父组件用 key 控制「每次打开 /
 * 切换供应商都重挂载」），因此不需要 effect 做表单同步——这是刻意规避
 * @mantine/form 的 form 对象每渲染必变导致的 setState-in-effect 死循环。
 *
 * 模型列表的增删改 / 设为默认都只改本地草稿，点「保存配置」时统一提交。
 */
export function ProviderDetailDrawer({
  provider,
  opened,
  onClose,
  onCreate,
  onUpdate,
  onTest,
}: ProviderDetailDrawerProps) {
  const isCreate = provider === null;
  const [tab, setTab] = useState<TabValue>('basic');

  // 标题名称：静态展示 + 铅笔图标，进入编辑后显示下划线输入框
  const [editingName, setEditingName] = useState(isCreate);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

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

  /** 提交：新建走 onCreate，编辑走 onUpdate（字段语义一致，仅 id 有无不同） */
  const handleSave = form.onSubmit(async (values) => {
    const payload = {
      name: values.name,
      enabled: values.enabled,
      baseUrl: values.baseUrl.trim(),
      apiKey: values.apiKey.trim() ? values.apiKey.trim() : undefined,
      models: [...new Set(values.models)],
      defaultModel: values.defaultModel,
    };

    if (provider) {
      const next = await onUpdate({ id: provider.id, ...payload });
      form.setValues(toFormValues(next));
      form.resetDirty();
    } else {
      await onCreate(payload);
      onClose();
    }
  });

  /* ---------------- 模型列表：只改本地草稿，保存时统一提交 ---------------- */

  const addModel = (candidate?: string) => {
    const modelId = (candidate ?? newModel).trim();

    if (!modelId) {
      setAddError('请输入模型 ID');
      return;
    }
    if (form.values.models.includes(modelId)) {
      setAddError('模型已存在');
      return;
    }

    const models = [...form.values.models, modelId];
    form.setFieldValue('models', models);
    if (!form.values.defaultModel) {
      form.setFieldValue('defaultModel', modelId);
    }
    setNewModel('');
    setAddError(null);
  };

  const renameModel = (oldId: string) => {
    const nextId = editingValue.trim();
    setEditingId(null);

    if (!nextId || nextId === oldId) return;
    if (form.values.models.includes(nextId)) {
      setAddError('模型已存在');
      return;
    }

    form.setFieldValue(
      'models',
      form.values.models.map((m) => (m === oldId ? nextId : m)),
    );
    if (form.values.defaultModel === oldId) {
      form.setFieldValue('defaultModel', nextId);
    }
  };

  const removeModel = (modelId: string) => {
    const models = form.values.models.filter((m) => m !== modelId);
    form.setFieldValue('models', models);

    if (form.values.defaultModel === modelId) {
      form.setFieldValue('defaultModel', models[0] ?? null);
    }
  };

  const setDefaultModel = (modelId: string) => {
    form.setFieldValue('defaultModel', modelId);
  };

  /** 连接测试：main 侧发一次极小的真实请求，成功/失败都落到结果条 */
  const runTest = async () => {
    if (!provider) return;

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
          <Box flex={1}>
            {/* 名称：静态展示 + 铅笔图标；点击后变成下划线输入框，失焦恢复 */}
            {editingName ? (
              <TextInput
                ref={nameInputRef}
                variant="unstyled"
                aria-label="供应商名称"
                placeholder="供应商名称"
                styles={{
                  input: {
                    borderBottom: '1px solid var(--mantine-color-blue-5)',
                    paddingLeft: 0,
                    paddingRight: 0,
                    fontSize: 'var(--mantine-font-size-lg)',
                    fontWeight: 600,
                    height: 28,
                    minHeight: 28,
                  },
                }}
                {...form.getInputProps('name')}
                onBlur={() => {
                  // 编辑时清空且已有名称，则回退到原名称，避免保存时报错难以察觉
                  if (!form.values.name.trim() && provider) {
                    form.setFieldValue('name', provider.name);
                  }
                  setEditingName(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            ) : (
              <Group gap="xs" wrap="nowrap">
                <Text fw={700} fz="lg" lh={1.2}>
                  {form.values.name || '供应商名称'}
                </Text>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="修改名称"
                  onClick={() => setEditingName(true)}
                >
                  <PencilSimpleIcon size={14} />
                </ActionIcon>
              </Group>
            )}
            <Text size="xs" c="dimmed" mt={4}>
              {provider ? '供应商详细配置' : '创建后可在列表中继续编辑'}
            </Text>
          </Box>
          {provider && (
            <Badge
              variant="light"
              color={form.values.enabled ? 'green' : 'gray'}
            >
              {form.values.enabled ? '已启用' : '未启用'}
            </Badge>
          )}
        </Group>
      }
    >
      <Stack gap="md">
        {provider && (
          <SegmentedControl
            w="100%"
            data={TABS}
            value={tab}
            onChange={(value) => setTab(value as TabValue)}
          />
        )}

        {tab === 'basic' && (
          <Stack gap="md">
            <Text fw={700}>API 接口配置</Text>
            <TextInput
              label="API Base URL"
              description="OpenAI API 格式，如 https://api.deepseek.com/v1"
              placeholder="留空使用 OpenAI 官方地址"
              {...form.getInputProps('baseUrl')}
            />
            <Stack gap={4}>
              <PasswordInput
                label="API Key"
                placeholder={
                  provider?.hasApiKey
                    ? '已保存（留空则不修改）'
                    : '输入 API Key'
                }
                {...form.getInputProps('apiKey')}
              />
              <Text size="xs" c="dimmed">
                密钥由系统安全保存（safeStorage 加密），页面只展示脱敏状态。
              </Text>
            </Stack>

            <Divider />

            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700}>模型列表</Text>
                <Badge variant="light" color="gray">
                  {form.values.models.length} 个
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                选择一项作为默认调用模型；删除后自动回落到第一个。
              </Text>

              {form.values.models.map((modelId) => (
                <Paper key={modelId} withBorder radius="md" p="xs">
                  {editingId === modelId ? (
                    <Group gap="xs" wrap="nowrap">
                      <TextInput
                        flex={1}
                        size="xs"
                        value={editingValue}
                        onChange={(event) =>
                          setEditingValue(event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') renameModel(modelId);
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <ActionIcon
                        variant="light"
                        color="blue"
                        aria-label="确认"
                        onClick={() => renameModel(modelId)}
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
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Group gap="xs" wrap="nowrap">
                        <Radio
                          checked={form.values.defaultModel === modelId}
                          onChange={() => setDefaultModel(modelId)}
                          aria-label={`将 ${modelId} 设为默认`}
                        />
                        <Text fw={500}>{modelId}</Text>
                        {form.values.defaultModel === modelId && (
                          <Badge size="xs" variant="light" color="green">
                            默认
                          </Badge>
                        )}
                      </Group>
                      <Group gap={4} wrap="nowrap">
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
                          onClick={() => removeModel(modelId)}
                        >
                          <TrashIcon size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  )}
                </Paper>
              ))}

              {form.values.models.length === 0 && (
                <Text c="dimmed" size="sm">
                  暂无模型，添加一个吧。
                </Text>
              )}

              <Stack gap={4}>
                <Group gap="xs" wrap="nowrap" align="flex-start">
                  <Autocomplete
                    flex={1}
                    size="xs"
                    placeholder="输入或选择模型 ID"
                    data={MODEL_SUGGESTIONS}
                    limit={10}
                    value={newModel}
                    onChange={(value) => {
                      setNewModel(value);
                      setAddError(null);
                    }}
                    // 选中候选时直接加入；自由输入则点「添加」
                    onOptionSubmit={(value) => addModel(value)}
                  />
                  <Button
                    size="xs"
                    color="dark"
                    leftSection={<PlusIcon size={14} />}
                    onClick={() => addModel()}
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
              disabled={provider ? !form.isDirty() : !form.values.name.trim()}
              loading={form.submitting}
              onClick={() => void handleSave()}
            >
              {provider ? '保存配置' : '创建供应商'}
            </Button>
          </Stack>
        )}

        {tab === 'test' && provider && (
          <Stack gap="md">
            <Text fw={700}>API 连通性测试</Text>
            <Paper withBorder radius="md" p="md">
              <Text size="sm" c="dimmed">
                即将测试的配置
              </Text>
              <Text fw={600} mt={4}>
                {form.values.name} / {form.values.defaultModel ?? '未选择模型'}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {form.values.baseUrl
                  ? `${form.values.baseUrl}/chat/completions`
                  : 'OpenAI 默认地址 /chat/completions'}
              </Text>
            </Paper>

            {form.isDirty() && (
              <Text size="xs" c="orange">
                有未保存的更改；连接测试使用服务端已保存的配置，请先保存。
              </Text>
            )}

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
