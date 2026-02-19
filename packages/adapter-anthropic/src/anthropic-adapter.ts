// ============================================================================
// ZEN AI SDK — Anthropic (Claude) Adapter
// Pluggable LLM interface for Claude models with Tool Use.
// ============================================================================

import Anthropic from "@anthropic-ai/sdk";
import type {
    LLMAdapter,
    ChatMessage,
    ChatResponse,
    LLMToolDefinition,
    LLMToolCall,
} from "@zen-ai/core";

/** Configuration for the Anthropic adapter. */
export interface AnthropicAdapterConfig {
    /** Anthropic API key. Defaults to ANTHROPIC_API_KEY env var. */
    apiKey?: string;
    /** Model to use. Default: "claude-sonnet-4-20250514". */
    model?: string;
    /** Temperature for completions. Default: 0.7. */
    temperature?: number;
    /** Maximum tokens for completions. Default: 4096. */
    maxTokens?: number;
}

/**
 * Anthropic (Claude) LLM Adapter for ZEN AI.
 *
 * Supports:
 * - Text completion
 * - Embedding generation (via text similarity workaround)
 * - Tool Use (function calling)
 */
export class AnthropicAdapter implements LLMAdapter {
    private client: Anthropic;
    private model: string;
    private temperature: number;
    private maxTokens: number;

    constructor(config: AnthropicAdapterConfig = {}) {
        this.client = new Anthropic({
            apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
        });
        this.model = config.model ?? "claude-sonnet-4-20250514";
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
    }

    /** Generate a text completion. */
    async complete(prompt: string): Promise<string> {
        const response = await this.client.messages.create({
            model: this.model,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            messages: [{ role: "user", content: prompt }],
        });

        const textBlock = response.content.find((b) => b.type === "text");
        return textBlock?.type === "text" ? textBlock.text : "";
    }

    /**
     * Generate an embedding vector.
     * Note: Anthropic does not natively support embeddings.
     * This implementation returns a simple hash-based vector as a placeholder.
     * For production, use a dedicated embedding provider (OpenAI, Cohere, etc).
     */
    async embed(text: string): Promise<number[]> {
        // Simple hash-based pseudo-embedding (128 dimensions)
        const vector = new Array(128).fill(0);
        for (let i = 0; i < text.length; i++) {
            vector[i % 128] += text.charCodeAt(i) / 1000;
        }
        // Normalize
        const magnitude = Math.sqrt(
            vector.reduce((sum: number, v: number) => sum + v * v, 0),
        );
        return magnitude > 0
            ? vector.map((v: number) => v / magnitude)
            : vector;
    }

    /** Chat completion with optional Tool Use. */
    async chat(
        messages: ChatMessage[],
        options?: { tools?: LLMToolDefinition[] },
    ): Promise<ChatResponse> {
        // Convert messages to Anthropic format
        const anthropicMessages = messages
            .filter((m) => m.role !== "system")
            .map((m) => this.toAnthropicMessage(m));

        const systemMessage = messages.find((m) => m.role === "system");
        const systemMessageContent = systemMessage?.content;

        // Convert tools to Anthropic format
        let anthropicTools: Anthropic.Tool[] = [];
        if (options?.tools?.length) {
            anthropicTools = options.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Anthropic.Tool.InputSchema,
            }));
        }

        const response = await this.client.messages.create({
            model: this.model, // Using instance model
            max_tokens: this.maxTokens, // Using instance maxTokens
            temperature: this.temperature, // Using instance temperature
            messages: anthropicMessages,
            system: systemMessageContent,
            tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        });

        const contentBlock = response.content.find((c) => c.type === "text");
        const content = contentBlock && contentBlock.type === "text" ? contentBlock.text : null;

        const toolCallBlocks = response.content.filter((c) => c.type === "tool_use");
        const toolCalls: LLMToolCall[] = toolCallBlocks.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.input,
        }));

        const usage = {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        };

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage,
        };
    }

    /** Convert ZEN AI message format to Anthropic format. */
    private toAnthropicMessage(
        msg: ChatMessage,
    ): Anthropic.MessageParam {
        switch (msg.role) {
            case "assistant":
                return { role: "assistant", content: msg.content };
            case "tool":
                return {
                    role: "user",
                    content: [
                        {
                            type: "tool_result",
                            tool_use_id: msg.toolCallId ?? "",
                            content: msg.content,
                        },
                    ],
                };
            default:
                return { role: "user", content: msg.content };
        }
    }
}
