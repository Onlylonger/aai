/**
 * Provider 相关的参考常量数据（不参与运行时，仅供后续测试 / 演示使用）。
 *
 * 历史背景：这些数据曾是内置的 providerPresets（启动时 seedDefaults 注入 +
 * 运行时缺省兜底）。现已移除预置逻辑——Provider 完全由用户创建，此文件仅
 * 保留原始数据备查。
 */

export type ProviderPresetSample = {
  name: string;
  defaultBaseURL?: string;
  defaultModels: string[];
};

/** 曾经内置的 provider 预置数据 */
export const PROVIDER_PRESET_SAMPLES: Record<string, ProviderPresetSample> = {
  openai: {
    name: 'OpenAI',
    defaultModels: ['gpt-5.1', 'gpt-5-mini'],
  },
  anthropic: {
    name: 'Anthropic',
    defaultModels: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  },
  google: {
    name: 'Google Gemini',
    defaultModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
  deepseek: {
    name: 'DeepSeek',
    defaultBaseURL: 'https://api.deepseek.com/v1',
    defaultModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  zhipu: {
    name: '智谱 AI',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModels: ['glm-4.6', 'glm-4.5-air', 'glm-4.5-flash'],
  },
};

export const PROVIDER_SAMPLE_IDS = Object.keys(PROVIDER_PRESET_SAMPLES);
