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
        const contents = this.toGeminiContents(messages);

        const tools: { functionDeclarations: FunctionDeclaration[] }[] = [];
        if (options?.tools?.length) {
            tools.push({
                functionDeclarations: options.tools.map((t) =>
                    this.toFunctionDeclaration(t),
                ),
            });
        }

        const result = await this.model.generateContent({
            contents,
            tools: tools.length ? tools : undefined,
            generationConfig: {
                temperature: this.temperature,
                maxOutputTokens: this.maxTokens,
            },
        });

        const response = result.response;
        const candidate = response.candidates?.[0];

        let content: string | null = null;
        const toolCalls: LLMToolCall[] = [];

        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if ("text" in part && part.text) {
                    content = part.text;
                } else if ("functionCall" in part && part.functionCall) {
                    toolCalls.push({
                        id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        name: part.functionCall.name,
                        arguments: (part.functionCall.args ?? {}) as Record<
                            string,
                            unknown
                        >,
                    });
                }
            }
        }

        return {
            content,
            toolCalls: toolCalls.length ? toolCalls : undefined,
        };
    }

    /** Convert ZEN AI messages to Gemini Content format. */
    private toGeminiContents(messages: ChatMessage[]): Content[] {
        const contents: Content[] = [];
        // Gemini uses system instruction separately; filter it out
        for (const msg of messages) {
            if (msg.role === "system") continue; // handled via systemInstruction
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
        return {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: SchemaType.OBJECT,
                properties: Object.fromEntries(
                    Object.entries(tool.parameters.properties ?? {}).map(
                        ([key, val]) => [
                            key,
                            {
                                type: val.type,
                                description: val.description,
                            },
                        ],
                    ),
                ),
                required: tool.parameters.required ?? [],
            },
        } as FunctionDeclaration;
    }
}
