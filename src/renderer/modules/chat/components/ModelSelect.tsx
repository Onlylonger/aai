import { useEffect, useMemo } from 'react';
import { Select } from '@mantine/core';

import type { ModelRef, ProviderId } from '@shared/api/provider';
import { useProviders } from '../../models/useProviders';

interface ModelSelectProps {
  value?: ModelRef;
  onChange: (model: ModelRef) => void;
  disabled?: boolean;
}

const SEP = '::';

/** 只列出「已启用且配置了 API Key」的 provider 下的模型 */
export function ModelSelect({ value, onChange, disabled }: ModelSelectProps) {
  const { providers } = useProviders();

  const data = useMemo(
    () =>
      providers
        .filter((p) => p.enabled && p.hasApiKey)
        .map((p) => ({
          group: p.name,
          items: p.models.map((m) => ({
            value: `${p.id}${SEP}${m}`,
            label: m,
          })),
        })),
    [providers],
  );

  const current = value ? `${value.providerId}${SEP}${value.modelId}` : null;
  const available = data.some((g) => g.items.some((i) => i.value === current));

  // 当前选择不可用（如 provider 被禁用）时，自动选第一个可用模型
  useEffect(() => {
    if (!available && data[0]?.items[0]) {
      const [providerId, modelId] = data[0].items[0].value.split(SEP);
      onChange({ providerId: providerId as ProviderId, modelId });
    }
  }, [available, data, onChange]);

  return (
    <Select
      size="xs"
      w={220}
      placeholder={data.length ? '选择模型' : '请先配置模型供应商'}
      data={data}
      value={available ? current : null}
      disabled={disabled || !data.length}
      allowDeselect={false}
      searchable
      comboboxProps={{ position: 'top-start' }}
      onChange={(v) => {
        if (!v) return;
        const [providerId, modelId] = v.split(SEP);
        onChange({ providerId: providerId as ProviderId, modelId });
      }}
    />
  );
}
