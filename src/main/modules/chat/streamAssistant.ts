/**
 * 通用的「一次模型流式调用」执行器。
 *
 * Chat 与 Agent 共用：只负责调用模型、转发 delta、汇总最终文本 / 推理 / 用量，
 * 不涉及消息落库或事件协议（调用方自己决定如何处理结果）。
 */
import { streamText, type ModelMessage } from 'ai';

import type { ModelRef } from '@shared/api/provider';
import type { RunFinishReason, RunUsage } from '@shared/chat';
import { getLanguageModel } from '../provider/providerRegistry';

export interface StreamAssistantOptions {
  model: ModelRef;
  instructions: string;
  messages: ModelMessage[];
  signal: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
}

interface StreamPartial {
  text: string;
  reasoning: string;
}

export type StreamAssistantOutcome =
  | ({
      type: 'finish';
      finishReason: RunFinishReason;
      usage?: RunUsage;
    } & StreamPartial)
  | ({ type: 'error'; error: string } & StreamPartial)
  | ({ type: 'abort' } & StreamPartial);

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function streamAssistant(
  options: StreamAssistantOptions,
): Promise<StreamAssistantOutcome> {
  let text = '';
  let reasoning = '';

  try {
    const model = await getLanguageModel(options.model);
    const result = streamText({
      model,
      instructions: options.instructions,
      messages: options.messages,
      abortSignal: options.signal,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          options.onTextDelta?.(part.text);
          break;
        case 'reasoning-delta':
          reasoning += part.text;
          options.onReasoningDelta?.(part.text);
          break;
        case 'error':
          // 流内错误（如 401、限流），AI SDK 不会 throw，而是作为 part 返回
          return {
            type: 'error',
            error: errorMessage(part.error),
            text,
            reasoning,
          };
        case 'abort':
          return { type: 'abort', text, reasoning };
        case 'finish':
          return {
            type: 'finish',
            finishReason: part.finishReason,
            usage: {
              inputTokens: part.totalUsage.inputTokens,
              outputTokens: part.totalUsage.outputTokens,
              totalTokens: part.totalUsage.totalTokens,
            },
            text,
            reasoning,
          };
        default:
          // step-start / tool-call 等在 Agent 阶段再处理
          break;
      }
    }

    // 兜底：流结束了但没有收到 finish / abort / error
    return { type: 'finish', finishReason: 'other', text, reasoning };
  } catch (error) {
    if (options.signal.aborted) {
      return { type: 'abort', text, reasoning };
    }
    return { type: 'error', error: errorMessage(error), text, reasoning };
  }
}
