// ============================================================================
// ZEN AI SDK — OpenAI Adapter
// Pluggable LLM interface for OpenAI models with Function Calling.
// ============================================================================

import OpenAI from "openai";
import type {
    LLMAdapter,
    ChatMessage,
    ChatResponse,
    LLMToolDefinition,
    LLMToolCall,
} from "@zen-ai/core";

/** Configuration for the OpenAI adapter. */
export interface OpenAIAdapterConfig {
    /** OpenAI API key. Defaults to OPENAI_API_KEY env var. */
    apiKey?: string;
    /** Model to use for completions. Default: "gpt-4o". */
    model?: string;
    /** Model to use for embeddings. Default: "text-embedding-3-small". */
    embeddingModel?: string;
    /** Temperature for completions. Default: 0.7. */
    temperature?: number;
    /** Maximum tokens for completions. Default: 4096. */
    maxTokens?: number;
}

/**
 * OpenAI LLM Adapter for ZEN AI.
 *
 * Supports:
 * - Text completion via chat endpoint
 * - Embedding generation
 * - Function Calling (tool use)
 */
export class OpenAIAdapter implements LLMAdapter {
    private client: OpenAI;
    private model: string;
    private embeddingModel: string;
    private temperature: number;
    private maxTokens: number;

    constructor(config: OpenAIAdapterConfig = {}) {
        this.client = new OpenAI({
            apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        });
        this.model = config.model ?? "gpt-4o";
        this.embeddingModel = config.embeddingModel ?? "text-embedding-3-small";
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
    }

    /** Generate a text completion. */
    async complete(prompt: string): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            temperature: this.temperature,
            max_tokens: this.maxTokens,
        });

        return response.choices[0]?.message?.content ?? "";
    }

    /** Generate an embedding vector. */
    async embed(text: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: this.embeddingModel,
            input: text,
        });

        return response.data[0].embedding;
    }

    /** Chat completion with optional Function Calling. */
    async chat(
        messages: ChatMessage[],
        options?: { tools?: LLMToolDefinition[] },
    ): Promise<ChatResponse> {
        const openaiMessages = messages.map((m) =>
            this.toOpenAIMessage(m),
        );

        const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
        {
            model: this.model,
            messages: openaiMessages,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
        };

        // Add tools if provided
        if (options?.tools?.length) {
            requestParams.tools = options.tools.map((t) => ({
                type: "function" as const,
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters as unknown as Record<string, unknown>,
                },
            }));
        }

        const response =
            await this.client.chat.completions.create(requestParams);
        const choice = response.choices[0];

        // Parse tool calls if present
        const toolCalls: LLMToolCall[] | undefined =
            choice?.message?.tool_calls?.map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments),
            }));

        return {
            content: choice?.message?.content ?? null,
            toolCalls: toolCalls?.length ? toolCalls : undefined,
        };
    }

    /** Convert ZEN AI message format to OpenAI format. */
    private toOpenAIMessage(
        msg: ChatMessage,
    ): OpenAI.Chat.Completions.ChatCompletionMessageParam {
        switch (msg.role) {
            case "system":
                return { role: "system", content: msg.content };
            case "user":
                return { role: "user", content: msg.content };
            case "assistant": {
                const assistantMsg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = {
                    role: "assistant",
                    content: msg.content || null,
                };
                if (msg.toolCalls?.length) {
                    assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
                        id: tc.id,
                        type: "function" as const,
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.arguments),
                        },
                    }));
                }
                return assistantMsg;
            }
            case "tool":
                return {
                    role: "tool",
                    content: msg.content,
                    tool_call_id: msg.toolCallId ?? "",
                };
            default:
                return { role: "user", content: msg.content };
        }
    }
}
