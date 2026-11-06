/**
 * 模型适配层（第二阶段的核心）。
 *
 * 职责：把 ModelRef（providerId + modelId）转换成 AI SDK 的 LanguageModel。
 * 上层的 ChatService / 未来的 AgentRuntime 只依赖 LanguageModel 接口。
 *
 * 所有 provider 统一走 OpenAI 兼容协议（国内厂商 DeepSeek / 智谱 / 通义 / Kimi
 * 等均提供该端点），厂商差异由配置里的 baseURL 表达。若未来需要接入
 * Anthropic / Gemini 原生协议，再在这里按 provider 的协议字段分支。
 */
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import type { ModelRef } from '@shared/api/provider';
import { providerService } from './providerService';
import type { ProviderRuntimeConfig } from './providerService';

export class ProviderConfigError extends Error {}

/** 构建 LanguageModel 所需的最小配置（已解密），从 provider 模块的运行配置中取子集 */
export type LanguageModelConfig = Pick<
  ProviderRuntimeConfig,
  'name' | 'baseURL' | 'apiKey'
>;

/**
 * 由已解密的运行配置构建 LanguageModel。
 * 不做「是否启用」校验——连接测试也复用这条构建路径（测试不要求 provider 已启用）。
 */
export function createLanguageModel(
  config: LanguageModelConfig,
  modelId: string,
): LanguageModel {
  const { apiKey, baseURL } = config;

  if (!apiKey) {
    throw new ProviderConfigError(`${config.name} 未配置 API Key`);
  }

  // OpenAI 兼容协议统一走 Chat Completions；默认调用方式是 Responses API，
  // 第三方网关多不支持，必须显式 .chat()
  return createOpenAI({ apiKey, baseURL, name: config.name }).chat(modelId);
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
