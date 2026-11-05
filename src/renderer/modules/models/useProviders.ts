import { useCallback, useEffect, useState } from 'react';

import type { ProviderConfigUpdate, ProviderConfigView } from '../../../shared/provider';

/** 读取 / 更新 provider 配置（数据存在 main 进程） */
export function useProviders() {
  const [providers, setProviders] = useState<ProviderConfigView[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setProviders(await window.api.invoke('provider:list', undefined));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(async (patch: ProviderConfigUpdate) => {
    const next = await window.api.invoke('provider:update', patch);
    setProviders((list) => list.map((p) => (p.id === next.id ? next : p)));
    return next;
  }, []);

  return { providers, loading, reload, update };
}
