/**
 * 模型适配层（第二阶段的核心）。
 *
 * 职责：把 ModelRef（providerId + modelId）转换成 AI SDK 的 LanguageModel。
 * 上层的 ChatService / 未来的 AgentRuntime 只依赖 LanguageModel 接口，
 * 不关心具体厂商 —— 请求走哪套协议由 provider 行的 type 字段决定
 * （用户自建 provider 时选择），新增协议只需要在这里加一个 case。
 */
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

import type { ModelRef } from '@shared/api/provider';
import { providerService } from '../provider/providerService';
import type { ProviderRuntimeConfig } from '../provider/providerService';

export class ProviderConfigError extends Error {}

/** 构建 LanguageModel 所需的最小配置（已解密），从 provider 模块的运行配置中取子集 */
export type LanguageModelConfig = Pick<
  ProviderRuntimeConfig,
  'name' | 'type' | 'baseURL' | 'apiKey'
>;

/**
 * 由已解密的运行配置构建 LanguageModel。
 * 不做「是否启用」校验——连接测试也复用这条构建路径（测试不要求 provider 已启用）。
 */
export function createLanguageModel(
  config: LanguageModelConfig,
  modelId: string,
): LanguageModel {
  const { apiKey, baseURL, type } = config;

  if (!apiKey) {
    throw new ProviderConfigError(`${config.name} 未配置 API Key`);
  }

  switch (type) {
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL })(modelId);
    case 'openai-compatible':
      // OpenAI 兼容协议（OpenAI / DeepSeek / 智谱 / 聚合网关等）统一走
      // Chat Completions；默认调用方式是 Responses API，第三方网关多不支持
      return createOpenAI({ apiKey, baseURL, name: config.name }).chat(modelId);
    default: {
      const exhaustive: never = type;
      throw new ProviderConfigError(`未知的接口协议: ${String(exhaustive)}`);
    }
  }
}

export async function getLanguageModel(ref: ModelRef): Promise<LanguageModel> {
  const { providerId, modelId } = ref;
  const config = await providerService.getRuntimeConfig(providerId);

  if (!config.enabled) {
    throw new ProviderConfigError(
      `${config.name} 未启用，请先在「模型供应商」中启用`,
    );
  }

  return createLanguageModel(config, modelId);
}
