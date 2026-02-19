// ============================================================================
// ZEN AI SDK — OpenAI Adapter
// Pluggable LLM interface for OpenAI-compatible models.
// ============================================================================

import OpenAI from "openai";
import type {
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionTool,
    ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
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
    /** Model to use. Default: "gpt-4o". */
    model?: string;
    /** Model to use for embeddings. Default: "text-embedding-3-small". */
    embeddingModel?: string;
    /** Temperature for completions. Default: 0.7. */
    temperature?: number;
    /** Maximum tokens for completions. Default: undefined (model limit). */
    maxTokens?: number;
}

/**
 * OpenAI LLM Adapter for ZEN AI.
 *
 * Supports:
 * - Text completion
 * - Embedding generation
 * - Function Calling (tool use)
 */
export class OpenAIAdapter implements LLMAdapter {
    private client: OpenAI;
    private model: string;
    private embeddingModel: string;
    private temperature: number;
    private maxTokens?: number;

    constructor(config: OpenAIAdapterConfig = {}) {
        this.client = new OpenAI({
            apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
        });
        this.model = config.model ?? "gpt-4o";
        this.embeddingModel = config.embeddingModel ?? "text-embedding-3-small";
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens;
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
        const openaiMessages = messages.map((m) => this.toOpenAIMessage(m));

        // Convert tools
        const openaiTools: ChatCompletionTool[] = [];
        if (options?.tools?.length) {
            openaiTools.push(...options.tools.map((t) => ({
                type: "function" as const,
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters as unknown as Record<string, unknown>,
                },
            })));
        }

        const requestParams: ChatCompletionCreateParamsNonStreaming = {
            model: this.model,
            messages: openaiMessages,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
        };

        if (openaiTools.length > 0) {
            requestParams.tools = openaiTools;
            requestParams.tool_choice = "auto";
        }

        const response =
            await this.client.chat.completions.create(requestParams);

        const choice = response.choices[0];
        const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
        }));

        const usage = response.usage ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
        } : undefined;

        return {
            content: choice?.message?.content ?? null,
            toolCalls: toolCalls?.length ? toolCalls : undefined,
            usage,
        };
    }

    /** Convert ZEN AI message format to OpenAI format. */
    private toOpenAIMessage(msg: ChatMessage): ChatCompletionMessageParam {
        switch (msg.role) {
            case "system":
                return { role: "system", content: msg.content };
            case "user":
                return { role: "user", content: msg.content };
            case "assistant":
                if (msg.toolCalls) {
                    return {
                        role: "assistant",
                        content: msg.content,
                        tool_calls: msg.toolCalls.map((tc) => ({
                            id: tc.id,
                            type: "function",
                            function: {
                                name: tc.name,
                                arguments: JSON.stringify(tc.arguments),
                            },
                        })),
                    };
                }
                return { role: "assistant", content: msg.content || null };
            case "tool":
                return {
                    role: "tool",
                    tool_call_id: msg.toolCallId ?? "",
                    content: msg.content,
                };
        }
    }
}
