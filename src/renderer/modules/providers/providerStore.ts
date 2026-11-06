/**
 * Provider 状态管理（zustand）。
 *
 * renderer 侧的单一数据源：ProvidersPage 与 chat 的 ModelSelect 共用同一份数据，
 * 避免各组件重复请求、状态不同步。
 * 组件只读 store，不直接碰 IPC。
 */
import { create } from 'zustand';

import {
  PROVIDER_CHANNELS,
  type ProviderCreate,
  type ProviderId,
  type ProviderUpdate,
  type ProviderView,
} from '@shared/api/provider';

interface ProviderState {
  providers: ProviderView[];
  loading: boolean;
  /** 首次加载完成标记，避免重复请求 */
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  create: (input: ProviderCreate) => Promise<ProviderView>;
  update: (patch: ProviderUpdate) => Promise<ProviderView>;
  remove: (id: ProviderId) => Promise<void>;
  test: (id: ProviderId) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  loading: false,
  loaded: false,
  error: null,

  async load() {
    if (get().loading || get().loaded) return;

    set({ loading: true, error: null });
    try {
      const providers = await window.api.invoke(
        PROVIDER_CHANNELS.list,
        undefined,
      );
      set({ providers, loaded: true, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },

  async create(input) {
    const created = await window.api.invoke(PROVIDER_CHANNELS.create, input);
    set((state) => ({ providers: [...state.providers, created] }));
    return created;
  },

  async update(patch) {
    const next = await window.api.invoke(PROVIDER_CHANNELS.update, patch);
    set((state) => ({
      providers: state.providers.map((p) => (p.id === next.id ? next : p)),
    }));
    return next;
  },

  async remove(id) {
    await window.api.invoke(PROVIDER_CHANNELS.delete, id);
    set((state) => ({
      providers: state.providers.filter((p) => p.id !== id),
    }));
  },

  async test(id) {
    await window.api.invoke(PROVIDER_CHANNELS.test, id);
  },
}));
