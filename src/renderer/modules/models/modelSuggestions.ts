/**
 * 「添加模型」输入框的候选列表（常见供应商的模型 ID）。
 *
 * 仅作为输入建议，不限制用户自由填写；模型 ID 以厂商文档为准，
 * 新增/下线模型时只需要维护这一处。
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

/** 扁平化的模型 ID 列表（列表行的默认模型输入框使用） */
export const MODEL_SUGGESTION_IDS = MODEL_SUGGESTIONS.flatMap(
  (group) => group.items,
);
