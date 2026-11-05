/**
 * Provider（模型供应商）相关的共享类型。
 * main 和 renderer 都会引用，所以这里只能放纯类型和常量，不能 import electron / node 模块。
 */

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'deepseek';

/** 模型引用：provider + model，作为一次请求「用哪个模型」的唯一标识 */
export interface ModelRef {
  providerId: ProviderId;
  modelId: string;
}

/** renderer 看到的 provider 配置（不包含明文 apiKey） */
export interface ProviderConfigView {
  id: ProviderId;
  name: string;
  enabled: boolean;
  baseURL?: string;
  hasApiKey: boolean;
  models: string[];
}

/** renderer 更新 provider 时提交的数据，apiKey 为 undefined 表示不修改 */
export interface ProviderConfigUpdate {
  id: ProviderId;
  enabled?: boolean;
  baseURL?: string;
  apiKey?: string;
  models?: string[];
}

/** 内置的 provider 元信息与默认模型列表 */
export const PROVIDER_PRESETS: Record<
  ProviderId,
  { name: string; defaultBaseURL?: string; defaultModels: string[] }
> = {
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
};

export const PROVIDER_IDS = Object.keys(PROVIDER_PRESETS) as ProviderId[];
