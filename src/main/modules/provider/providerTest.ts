/**
 * Provider 连接测试：向目标模型发起一次极小的真实请求，
 * 验证 API Key 鉴权、模型权限与网关连通性。
 */
import { generateText } from 'ai';

import { providerService } from './providerService';
import { createLanguageModel } from './providerRegistry';

/** 超时保护：网关无响应时避免测试按钮一直转圈 */
const TEST_TIMEOUT_MS = 15_000;

export async function testProviderConnection(id: string): Promise<void> {
  const config = await providerService.getRuntimeConfig(id);

  if (!config.apiKey) {
    throw new Error(
      `${config.name} 未配置 API Key，请先在「基本配置」中填写并保存`,
    );
  }

  if (!config.modelId) {
    throw new Error(
      `${config.name} 未设置默认模型，请先在「模型列表」中选择一个`,
    );
  }

  const model = createLanguageModel(config, config.modelId);

  await generateText({
    model,
    prompt: 'ping',
    maxOutputTokens: 8,
    abortSignal: AbortSignal.timeout(TEST_TIMEOUT_MS),
  });
}
