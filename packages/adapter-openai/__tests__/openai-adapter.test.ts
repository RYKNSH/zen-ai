// ============================================================================
// ZEN AI SDK — OpenAI Adapter Tests (Mocked)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock openai module
vi.mock("openai", () => {
    return {
        default: class MockOpenAI {
            chat = {
                completions: {
                    create: vi.fn().mockResolvedValue({
                        choices: [
                            {
                                message: {
                                    content: "Hello from GPT",
                                    tool_calls: undefined,
                                },
                            },
                        ],
                    }),
                },
            };
            embeddings = {
                create: vi.fn().mockResolvedValue({
                    data: [{ embedding: new Array(1536).fill(0.1) }],
                }),
            };
        },
    };
});

import { OpenAIAdapter } from "../src/openai-adapter.js";

describe("OpenAIAdapter", () => {
    let adapter: OpenAIAdapter;

    beforeEach(() => {
        adapter = new OpenAIAdapter({ apiKey: "test-key" });
    });

    it("should create with default config", () => {
        const a = new OpenAIAdapter();
        expect(a).toBeDefined();
    });

    it("should complete a prompt", async () => {
        const result = await adapter.complete("Hello");
        expect(result).toBe("Hello from GPT");
    });

    it("should generate embeddings", async () => {
        const result = await adapter.embed("test text");
        expect(result).toHaveLength(1536);
        expect(result[0]).toBe(0.1);
    });

    it("should handle chat without tools", async () => {
        const result = await adapter.chat([
            { role: "user", content: "Hello" },
        ]);
        expect(result.content).toBe("Hello from GPT");
        expect(result.toolCalls).toBeUndefined();
    });

    it("should handle chat with system messages", async () => {
        const result = await adapter.chat([
            { role: "system", content: "You are helpful" },
            { role: "user", content: "Hello" },
        ]);
        expect(result.content).toBe("Hello from GPT");
    });

    it("should handle chat with assistant messages", async () => {
        const result = await adapter.chat([
            { role: "assistant", content: "Previous response" },
            { role: "user", content: "Follow up" },
        ]);
        expect(result.content).toBe("Hello from GPT");
    });

    it("should handle chat with tool messages", async () => {
        const result = await adapter.chat([
            { role: "tool", content: "Tool result", toolCallId: "tc_123" },
        ]);
        expect(result.content).toBe("Hello from GPT");
    });

    it("should pass tools to API", async () => {
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
