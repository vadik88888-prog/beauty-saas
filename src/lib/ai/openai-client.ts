import OpenAI from 'openai'
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/chat/completions'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface LLMCallOptions {
  system: string
  // Full message history in OpenAI format — caller is responsible for building it
  // Supports vision: user messages can have content array with image_url parts
  messages: ChatCompletionMessageParam[]
  tools?: ChatCompletionTool[]
  model?: string
  maxTokens?: number
  temperature?: number
  // Force a specific tool call. Pass { type: 'function', function: { name: 'tool_name' } } to override auto.
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  // Reasoning effort for GPT-5.x / o-series. Lower = faster, fewer hidden reasoning tokens.
  // Ignored by older (non-reasoning) models. Pass 'low'/'minimal' for latency-sensitive chat.
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export interface LLMResponse {
  content: string
  tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
  finish_reason: string
  total_tokens: number
  // The raw assistant message — needed to append to messages array for multi-turn tool calls
  assistantMessage: OpenAI.Chat.ChatCompletionMessage
}

/**
 * Modern models (GPT-5.x, o1, o3) require `max_completion_tokens` instead of `max_tokens`.
 * Older models (gpt-4o, gpt-4-turbo) still use `max_tokens`. This helper picks the right key.
 */
function isModernModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/i.test(model)
}

export async function callLLM(opts: LLMCallOptions): Promise<LLMResponse> {
  const model = opts.model ?? 'gpt-4o-mini'

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: opts.system },
    ...opts.messages,
  ]

  const tokenLimit = opts.maxTokens ?? 500
  const baseParams = {
    model,
    messages,
    tools: opts.tools?.length ? opts.tools : undefined,
    tool_choice: opts.tools?.length ? (opts.toolChoice ?? 'auto') : undefined,
  }

  // GPT-5.x / o1 / o3 use max_completion_tokens; they also don't accept custom temperature
  // (always 1) but support reasoning_effort. Older models use max_tokens + adjustable temperature.
  const params = isModernModel(model)
    ? {
        ...baseParams,
        max_completion_tokens: tokenLimit,
        ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      }
    : { ...baseParams, max_tokens: tokenLimit, temperature: opts.temperature ?? 0.3 }

  const response = (await openai.chat.completions.create(params as unknown as Parameters<typeof openai.chat.completions.create>[0])) as OpenAI.Chat.ChatCompletion

  const choice = response.choices[0]

  return {
    content: choice.message.content ?? '',
    tool_calls: choice.message.tool_calls,
    finish_reason: choice.finish_reason,
    total_tokens: response.usage?.total_tokens ?? 0,
    assistantMessage: choice.message,
  }
}

export function estimateCost(model: string, tokens: number): number {
  // Approximate per-token cost (input+output mix). Real cost should be computed from usage.
  const rates: Record<string, number> = {
    'gpt-4o': 0.000005,
    'gpt-4o-mini': 0.0000002,
    'gpt-4-turbo': 0.00001,
    'gpt-5.2': 0.0000079,         // ~$1.75 in / $14 out, avg
    'gpt-5.2-codex': 0.0000079,
    'gpt-5.5': 0.0000175,         // ~$5 in / $30 out
    'gpt-5.5-pro': 0.000105,      // ~$30 in / $180 out
    'o1-mini': 0.000003,
    'o3-mini': 0.0000022,
  }
  return (rates[model] ?? 0.000002) * tokens
}
