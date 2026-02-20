// ============================================================================
// ZEN AI SDK — Google Adapter Tests (Mocked)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @google/generative-ai
vi.mock("@google/generative-ai", () => {
    return {
        SchemaType: { OBJECT: "OBJECT", STRING: "STRING" },
        GoogleGenerativeAI: class MockGoogleAI {
            getGenerativeModel() {
                return {
                    generateContent: vi.fn().mockResolvedValue({
                        response: {
                            text: () => "Hello from Gemini",
                            functionCalls: () => undefined,
                            usageMetadata: {
                                promptTokenCount: 10,
                                candidatesTokenCount: 5,
                                totalTokenCount: 15,
                            },
                            candidates: [
                                {
                                    content: {
                                        parts: [{ text: "Hello from Gemini" }],
                                    },
                                },
                            ],
                        },
                    }),
                    embedContent: vi.fn().mockResolvedValue({
                        embedding: { values: new Array(768).fill(0.05) },
                    }),
                };
            }
        },
    };
});

import { GoogleAdapter } from "../src/google-adapter.js";

describe("GoogleAdapter", () => {
    let adapter: GoogleAdapter;

    beforeEach(() => {
        adapter = new GoogleAdapter({ apiKey: "test-key" });
    });

    it("should create with default config", () => {
        const a = new GoogleAdapter();
        expect(a).toBeDefined();
    });

    it("should complete a prompt", async () => {
        const result = await adapter.complete("Hello");
        expect(result).toBe("Hello from Gemini");
    });

    it("should generate embeddings", async () => {
        const result = await adapter.embed("test text");
        expect(result).toHaveLength(768);
        expect(result[0]).toBe(0.05);
    });

    it("should handle chat without tools", async () => {
        const result = await adapter.chat([
            { role: "user", content: "Hello" },
        ]);
        expect(result.content).toBe("Hello from Gemini");
        expect(result.toolCalls).toBeUndefined();
    });

    it("should filter system messages in chat", async () => {
        const result = await adapter.chat([
            { role: "system", content: "System prompt" },
            { role: "user", content: "Hello" },
        ]);
        expect(result.content).toBe("Hello from Gemini");
    });

    it("should handle assistant messages as model role", async () => {
        const result = await adapter.chat([
            { role: "assistant", content: "Prior" },
            { role: "user", content: "Next" },
        ]);
        expect(result.content).toBe("Hello from Gemini");
    });

    it("should handle tool result messages", async () => {
        const result = await adapter.chat([
            { role: "tool", content: "Result", toolCallId: "fn_1" },
        ]);
        expect(result.content).toBe("Hello from Gemini");
    });

    it("should pass tools as function declarations", async () => {
        const result = await adapter.chat(
            [{ role: "user", content: "Test" }],
            {
                tools: [
                    {
                        name: "test_tool",
                        description: "A test tool",
                        parameters: {
                            type: "object",
                            properties: {
                                input: { type: "string", description: "Input" },
                            },
                            required: ["input"],
                        },
                    },
                ],
            },
        );
        expect(result).toBeDefined();
    });
});
