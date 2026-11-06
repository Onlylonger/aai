/**
 * 「添加模型」输入框的候选提示。
 *
 * 只是常见模型 ID 的输入辅助，不代表权威清单：
 * - 模型可能改名、下线，或只在特定网关/账号下存在
 * - 用户始终可以自由输入任意模型 ID
 * 维护时按厂商实际文档更新即可。
 */
export const MODEL_SUGGESTIONS: { group: string; items: string[] }[] = [
  {
    group: 'DeepSeek',
    items: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash'],
  },
  {
    group: '智谱 AI',
    items: ['glm-5.3-flashx', 'glm-4.6', 'glm-4.5-air', 'glm-4.5-flash'],
  },
  {
    group: '通义千问',
    items: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
  },
  {
    group: 'Kimi',
    items: ['kimi-k2', 'moonshot-v1-128k', 'moonshot-v1-32k'],
  },
  {
    group: 'MiniMax',
    items: ['MiniMax-M2', 'MiniMax-Text-01'],
  },
  {
    group: 'OpenAI',
    items: ['gpt-5.2', 'gpt-5.1', 'gpt-5-mini'],
  },
  {
    group: 'Anthropic',
    items: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  },
  {
    group: 'Google',
    items: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  },
];
