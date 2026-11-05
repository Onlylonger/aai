import {
  Box,
  Button,
  Drawer,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm, schemaResolver } from '@mantine/form';

import type {
  ProviderCreate,
  ProviderProtocol,
  ProviderRegion,
} from '@shared/api/provider';
import { providerCreateSchema } from '@shared/api/provider';

const TYPE_OPTIONS: { value: ProviderProtocol; label: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
];

const REGION_OPTIONS: { value: ProviderRegion; label: string }[] = [
  { value: 'international', label: '国际' },
  { value: 'domestic', label: '国产' },
];

interface ProviderCreateDrawerProps {
  opened: boolean;
  onClose: () => void;
  /** 提交创建，main 返回新视图（useProviders.create） */
  onCreate: (input: ProviderCreate) => Promise<unknown>;
}

/**
 * 新建供应商抽屉：只收集三个必填/默认字段（名称 / 接口协议 / 地区），
 * 其余配置（Base URL、Key、模型）创建后在详情抽屉里补全。
 */
export function ProviderCreateDrawer({
  opened,
  onClose,
  onCreate,
}: ProviderCreateDrawerProps) {
  const form = useForm<ProviderCreate>({
    initialValues: {
      name: '',
      type: 'openai-compatible',
      region: 'international',
    },
    validate: schemaResolver(providerCreateSchema, { sync: true }),
  });

  const handleSubmit = form.onSubmit(async (values) => {
    await onCreate(values);
    onClose();
  });

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={560}
      title={
        <Box>
          <Title order={5}>添加供应商</Title>
          <Text size="xs" c="dimmed">
            创建后可在详情中完善配置
          </Text>
        </Box>
      }
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="名称"
            placeholder="如 OpenAI、公司中转网关"
            data-autofocus
            {...form.getInputProps('name')}
          />
          <Select
            label="接口协议"
            description="决定请求走哪套 SDK；大多数聚合网关选 OpenAI 兼容"
            data={TYPE_OPTIONS}
            allowDeselect={false}
            {...form.getInputProps('type')}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              地区
            </Text>
            <SegmentedControl
              w="100%"
              data={REGION_OPTIONS}
              {...form.getInputProps('region')}
            />
          </Stack>

          <Button
            type="submit"
            color="dark"
            radius="md"
            loading={form.submitting}
            mt="sm"
          >
            创建
          </Button>
        </Stack>
      </form>
    </Drawer>
  );
}
