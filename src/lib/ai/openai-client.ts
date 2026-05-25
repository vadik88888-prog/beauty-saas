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
}

export interface LLMResponse {
  content: string
  tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
  finish_reason: string
  total_tokens: number
  // The raw assistant message — needed to append to messages array for multi-turn tool calls
  assistantMessage: OpenAI.Chat.ChatCompletionMessage
}

export async function callLLM(opts: LLMCallOptions): Promise<LLMResponse> {
  const model = opts.model ?? 'gpt-4o-mini'

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: opts.system },
    ...opts.messages,
  ]

  const response = await openai.chat.completions.create({
    model,
    messages,
    tools: opts.tools?.length ? opts.tools : undefined,
    tool_choice: opts.tools?.length ? 'auto' : undefined,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 500,
  })

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
  const rates: Record<string, number> = {
    'gpt-4o': 0.000005,
    'gpt-4o-mini': 0.0000002,
    'gpt-4-turbo': 0.00001,
  }
  return (rates[model] ?? 0.000002) * tokens
}
