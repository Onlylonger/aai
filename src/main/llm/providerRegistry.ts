/**
 * 模型适配层（第二阶段的核心）。
 *
 * 职责：把 ModelRef（providerId + modelId）转换成 AI SDK 的 LanguageModel。
 * 上层的 ChatService / 未来的 AgentRuntime 只依赖 LanguageModel 接口，
 * 不关心具体是哪家厂商 —— 新增厂商只需要在这里加一个 case。
 */
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

import type { ModelRef } from '../../shared/provider';
import { PROVIDER_PRESETS } from '../../shared/provider';
import { providerStore } from '../settings/providerStore';

export class ProviderConfigError extends Error {}

export function getLanguageModel(ref: ModelRef): LanguageModel {
  const { providerId, modelId } = ref;
  const config = providerStore.getRuntimeConfig(providerId);
  const name = PROVIDER_PRESETS[providerId].name;

  if (!config.enabled) {
    throw new ProviderConfigError(`${name} 未启用，请先在「模型供应商」中启用`);
  }
  if (!config.apiKey) {
    throw new ProviderConfigError(`${name} 未配置 API Key`);
  }

  const { apiKey, baseURL } = config;

  switch (providerId) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL })(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL })(modelId);
    case 'deepseek':
      // DeepSeek 兼容 OpenAI Chat Completions 协议，注意要用 .chat()，
      // 默认调用方式走的是 OpenAI 的 Responses API，DeepSeek 不支持
      return createOpenAI({ apiKey, baseURL, name: 'deepseek' }).chat(modelId);
    default: {
      const exhaustive: never = providerId;
      throw new ProviderConfigError(`未知的 provider: ${String(exhaustive)}`);
    }
  }
}
