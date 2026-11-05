import { useEffect, useState } from 'react';

import {
  Badge,
  Button,
  Card,
  Group,
  PasswordInput,
  ScrollArea,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';

import type { ProviderConfigUpdate, ProviderConfigView } from '../../../../shared/provider';
import { useProviders } from '../useProviders';

function ProviderCard({
  provider,
  onSave,
}: {
  provider: ProviderConfigView;
  onSave: (patch: ProviderConfigUpdate) => Promise<unknown>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [baseURL, setBaseURL] = useState(provider.baseURL ?? '');
  const [models, setModels] = useState(provider.models);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBaseURL(provider.baseURL ?? '');
    setModels(provider.models);
  }, [provider]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        id: provider.id,
        baseURL,
        models,
        // 留空表示不修改已保存的 key
        apiKey: apiKey ? apiKey : undefined,
      });
      setApiKey('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Text fw={600}>{provider.name}</Text>
          {provider.hasApiKey ? (
            <Badge size="xs" color="green" variant="light">
              已配置 Key
            </Badge>
          ) : (
            <Badge size="xs" color="gray" variant="light">
              未配置 Key
            </Badge>
          )}
        </Group>
        <Switch
          label="启用"
          checked={provider.enabled}
          onChange={(e) => void onSave({ id: provider.id, enabled: e.currentTarget.checked })}
        />
      </Group>

      <Stack gap="xs">
        <PasswordInput
          size="xs"
          label="API Key"
          placeholder={provider.hasApiKey ? '已保存（留空则不修改）' : '输入 API Key'}
          value={apiKey}
          onChange={(e) => setApiKey(e.currentTarget.value)}
        />
        <TextInput
          size="xs"
          label="Base URL（可选）"
          placeholder="使用官方默认地址"
          value={baseURL}
          onChange={(e) => setBaseURL(e.currentTarget.value)}
        />
        <TagsInput
          size="xs"
          label="模型列表"
          description="回车添加模型 ID"
          value={models}
          onChange={setModels}
        />
        <Group justify="flex-end" gap="xs">
          {provider.hasApiKey && (
            <Button
              size="xs"
              variant="subtle"
              color="red"
              onClick={() => void onSave({ id: provider.id, apiKey: '' })}
            >
              清除 Key
            </Button>
          )}
          <Button size="xs" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function ProvidersPage() {
  const { providers, update } = useProviders();

  return (
    <ScrollArea h="100%" p="md">
      <Title order={4} mb="md">
        模型供应商
      </Title>
      <Stack gap="md" maw={640}>
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onSave={update} />
        ))}
      </Stack>
    </ScrollArea>
  );
}
