import { useCallback, useEffect, useState } from 'react';

import {
  PROVIDER_CHANNELS,
  type ProviderCreate,
  type ProviderId,
  type ProviderUpdate,
  type ProviderView,
} from '@shared/api/provider';

/** 读取 / 创建 / 更新 provider 配置（数据存在 main 进程） */
export function useProviders() {
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const list = await window.api.invoke(PROVIDER_CHANNELS.list, undefined);
    setProviders(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // setState 全部发生在 await 之后（异步边界），不会造成同步级联渲染；
      // 初次 loading 态由 useState 初始值表达
      const list = await window.api.invoke(PROVIDER_CHANNELS.list, undefined);
      if (cancelled) return;
      setProviders(list);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async (input: ProviderCreate) => {
    const created = await window.api.invoke(PROVIDER_CHANNELS.create, input);
    setProviders((list) => [...list, created]);
    return created;
  }, []);

  const update = useCallback(async (patch: ProviderUpdate) => {
    const next = await window.api.invoke(PROVIDER_CHANNELS.update, patch);
    setProviders((list) => list.map((p) => (p.id === next.id ? next : p)));
    return next;
  }, []);

  const remove = useCallback(async (id: ProviderId) => {
    await window.api.invoke(PROVIDER_CHANNELS.delete, id);
    setProviders((list) => list.filter((p) => p.id !== id));
  }, []);

  const test = useCallback(async (id: ProviderId) => {
    await window.api.invoke(PROVIDER_CHANNELS.test, id);
  }, []);

  return { providers, loading, reload, create, update, remove, test };
}
