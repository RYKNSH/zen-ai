// ============================================================================
// ZEN AI SDK — Anthropic Adapter Tests (Mocked)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => {
    return {
        default: class MockAnthropic {
            messages = {
                create: vi.fn().mockResolvedValue({
                    content: [
                        { type: "text", text: "Hello from Claude" },
                    ],
                    usage: {
                        input_tokens: 10,
                        output_tokens: 5,
                    },
                }),
            };
        },
    };
});

import { AnthropicAdapter } from "../src/anthropic-adapter.js";

describe("AnthropicAdapter", () => {
    let adapter: AnthropicAdapter;

    beforeEach(() => {
        adapter = new AnthropicAdapter({ apiKey: "test-key" });
    });

    it("should create with default config", () => {
        const a = new AnthropicAdapter();
        expect(a).toBeDefined();
    });

    it("should complete a prompt", async () => {
        const result = await adapter.complete("Hello");
        expect(result).toBe("Hello from Claude");
    });

    it("should generate pseudo-embeddings", async () => {
        const result = await adapter.embed("test text");
        expect(result).toHaveLength(128);
        // Should be normalized (magnitude ≈ 1)
        const magnitude = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
        expect(magnitude).toBeCloseTo(1.0, 1);
    });

    it("should handle chat without tools", async () => {
        const result = await adapter.chat([
            { role: "user", content: "Hello" },
        ]);
        expect(result.content).toBe("Hello from Claude");
        expect(result.toolCalls).toBeUndefined();
    });

    it("should handle system messages separately", async () => {
        const result = await adapter.chat([
            { role: "system", content: "You are helpful" },
            { role: "user", content: "Hello" },
        ]);
        expect(result.content).toBe("Hello from Claude");
    });

    it("should handle assistant messages", async () => {
        const result = await adapter.chat([
            { role: "assistant", content: "Prior" },
            { role: "user", content: "Next" },
        ]);
        expect(result.content).toBe("Hello from Claude");
    });

    it("should handle tool result messages", async () => {
        const result = await adapter.chat([
            { role: "tool", content: "Result", toolCallId: "tc_1" },
        ]);
        expect(result.content).toBe("Hello from Claude");
    });

    it("should return empty string when no text block", async () => {
        const a = new AnthropicAdapter({ apiKey: "test" });
        // Override mock for this test
        const mockCreate = vi.fn().mockResolvedValue({
            content: [{ type: "tool_use", id: "t1", name: "fn", input: {} }],
            usage: { input_tokens: 5, output_tokens: 3 },
        });
        (a as any).client = { messages: { create: mockCreate } };

        const result = await a.complete("test");
        expect(result).toBe("");
    });

    it("should handle embed with empty text", async () => {
        const result = await adapter.embed("");
        expect(result).toHaveLength(128);
    });
});
