// ============================================================================
// ZEN AI SDK — Google (Gemini) Adapter
// Pluggable LLM interface for Gemini models with Function Calling.
// ============================================================================

import {
    GoogleGenerativeAI,
    type GenerativeModel,
    type Content,
    type FunctionDeclaration,
    SchemaType,
} from "@google/generative-ai";
import type {
    LLMAdapter,
    ChatMessage,
    ChatResponse,
    LLMToolDefinition,
    LLMToolCall,
} from "@zen-ai/core";

/** Configuration for the Google Gemini adapter. */
export interface GoogleAdapterConfig {
    /** Google AI API key. Defaults to GOOGLE_API_KEY env var. */
    apiKey?: string;
    /** Model to use. Default: "gemini-2.0-flash". */
    model?: string;
    /** Model to use for embeddings. Default: "text-embedding-004". */
    embeddingModel?: string;
    /** Temperature for completions. Default: 0.7. */
    temperature?: number;
    /** Maximum tokens for completions. Default: 4096. */
    maxTokens?: number;
}

/**
 * Google (Gemini) LLM Adapter for ZEN AI.
 *
 * Supports:
 * - Text completion
 * - Embedding generation
 * - Function Calling (tool use)
 */
export class GoogleAdapter implements LLMAdapter {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;
    private embeddingModelName: string;
    private temperature: number;
    private maxTokens: number;

    constructor(config: GoogleAdapterConfig = {}) {
        const apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY ?? "";
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: config.model ?? "gemini-2.0-flash",
        });
        this.embeddingModelName = config.embeddingModel ?? "text-embedding-004";
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
    }

    /** Generate a text completion. */
    async complete(prompt: string): Promise<string> {
        const result = await this.model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: this.temperature,
                maxOutputTokens: this.maxTokens,
            },
        });

        return result.response.text();
    }

    /** Generate an embedding vector. */
    async embed(text: string): Promise<number[]> {
        const embeddingModel = this.genAI.getGenerativeModel({
            model: this.embeddingModelName,
        });
        const result = await embeddingModel.embedContent(text);
        return result.embedding.values;
    }

    /** Chat completion with optional Function Calling. */
    async chat(
        messages: ChatMessage[],
        options?: { tools?: LLMToolDefinition[] },
    ): Promise<ChatResponse> {
        const geminiMessages = this.toGeminiContents(messages);

        // Convert tools
        const tools: Array<{ functionDeclarations: FunctionDeclaration[] }> = [];
        if (options?.tools?.length) {
            tools.push({
                functionDeclarations: options.tools.map((t) =>
                    this.toFunctionDeclaration(t)
                ),
            });
        }

        const result = await this.model.generateContent({
            contents: geminiMessages,
            tools: tools.length > 0 ? tools : undefined,
        });

        const response = result.response;
        // Handle safety blocks/empty responses
        let text = "";
        try {
            text = response.text();
        } catch {
            text = "";
        }

        const functionCalls = response.functionCalls();
        const toolCalls = functionCalls?.map((fc) => ({
            id: `call_${Math.random().toString(36).slice(2)}`,
            name: fc.name,
            arguments: fc.args as Record<string, unknown>,
        }));

        const meta = response.usageMetadata;
        const usage = meta ? {
            promptTokens: meta.promptTokenCount,
            completionTokens: meta.candidatesTokenCount,
            totalTokens: meta.totalTokenCount,
        } : undefined;

        return {
            content: text,
            toolCalls,
            usage,
        };
    }

    /** Convert ZEN AI messages to Gemini Content format. */
    private toGeminiContents(messages: ChatMessage[]): Content[] {
        const contents: Content[] = [];
        for (const msg of messages) {
            if (msg.role === "system") continue; // Gemini uses separate systemInstruction (set in model) or prompts
            if (msg.role === "tool") {
                contents.push({
                    role: "function",
                    parts: [
                        {
                            functionResponse: {
                                name: msg.toolCallId ?? "unknown",
                                response: { result: msg.content },
                            },
                        },
                    ],
                });
            } else {
                contents.push({
                    role: msg.role === "assistant" ? "model" : "user",
                    parts: [{ text: msg.content }],
                });
            }
        }
        return contents;
    }

    /** Convert LLMToolDefinition to Gemini FunctionDeclaration. */
    private toFunctionDeclaration(
        tool: LLMToolDefinition,
    ): FunctionDeclaration {
        // Simplified parameter conversion
        // Note: Gemini schema is stricter than generic JSON schema
        const properties: Record<string, any> = {};
        const required = tool.parameters.required || [];

        if (tool.parameters.properties) {
            for (const [key, val] of Object.entries(tool.parameters.properties)) {
                properties[key] = {
                    type: this.mapSchemaType(val.type),
                    description: val.description,
                };
            }
        }

        return {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: SchemaType.OBJECT,
                properties,
                required,
            },
        } as FunctionDeclaration;
    }

    private mapSchemaType(type: string): SchemaType {
        switch (type.toLowerCase()) {
            case "string": return SchemaType.STRING;
            case "number":
            case "integer": return SchemaType.NUMBER;
            case "boolean": return SchemaType.BOOLEAN;
            case "array": return SchemaType.ARRAY;
            case "object": return SchemaType.OBJECT;
            default: return SchemaType.STRING;
        }
    }
}
