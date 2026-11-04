/**
 * Agent 的流式执行器（带工具的多步循环）。
 *
 * 使用 AI SDK 的 streamText + tools + stopWhen 自动完成
 * 「LLM → tool → observe → LLM ...」循环，并把过程中的
 * step / tool-call / tool-result 回调给 AgentRuntime 落库与发事件。
 */
import { stepCountIs, streamText, type ModelMessage } from 'ai';

import type { ModelRef } from '@shared/api/provider';
import type { RunFinishReason, RunUsage } from '@shared/chat';
import { errorMessage } from '../chat/streamAssistant';
import { getLanguageModel } from '../provider/providerRegistry';

import { agentTools } from './tools';

/** 单次 Agent 任务最多允许的模型步数，避免工具循环失控 */
const MAX_STEPS = 8;

export interface AgentStreamHandlers {
  onTextDelta: (delta: string) => void;
  onReasoningDelta: (delta: string) => void;
  /** 模型步开始（1-based），用于记录 llm 步骤 */
  onStepStart: (stepNumber: number) => void;
  onStepFinish: (stepNumber: number, finishReason: string) => void;
  onToolCall: (call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }) => void;
  onToolResult: (result: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    output: unknown;
  }) => void;
  onToolError: (error: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    error: string;
  }) => void;
}

interface StreamPartial {
  text: string;
  reasoning: string;
}

export type AgentStreamOutcome =
  | ({
      type: 'finish';
      finishReason: RunFinishReason;
      usage?: RunUsage;
    } & StreamPartial)
  | ({ type: 'error'; error: string } & StreamPartial)
  | ({ type: 'abort' } & StreamPartial);

export async function streamAgent(options: {
  model: ModelRef;
  instructions: string;
  messages: ModelMessage[];
  signal: AbortSignal;
  handlers: AgentStreamHandlers;
}): Promise<AgentStreamOutcome> {
  const { handlers } = options;
  let text = '';
  let reasoning = '';

  try {
    const model = await getLanguageModel(options.model);
    const result = streamText({
      model,
      instructions: options.instructions,
      messages: options.messages,
      tools: agentTools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: options.signal,
    });

    let stepNumber = 0;

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          text += part.text;
          handlers.onTextDelta(part.text);
          break;
        case 'reasoning-delta':
          reasoning += part.text;
          handlers.onReasoningDelta(part.text);
          break;
        case 'start-step':
          stepNumber += 1;
          handlers.onStepStart(stepNumber);
          break;
        case 'finish-step':
          handlers.onStepFinish(stepNumber, part.finishReason);
          break;
        case 'tool-call':
          handlers.onToolCall({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          });
          break;
        case 'tool-result':
          handlers.onToolResult({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            output: part.output,
          });
          break;
        case 'tool-error':
          handlers.onToolError({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            error: errorMessage(part.error),
          });
          break;
        case 'error':
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
          break;
      }
    }

    return { type: 'finish', finishReason: 'other', text, reasoning };
  } catch (error) {
    if (options.signal.aborted) {
      return { type: 'abort', text, reasoning };
    }
    return { type: 'error', error: errorMessage(error), text, reasoning };
  }
}
