import { describe, it, expect, vi } from "vitest";
import { ZenAgent } from "../src/zen-agent.js";
import type { LLMAdapter, ChatResponse, Tool, Observation, Delta } from "../src/types.js";

// ============================================================================
// Test helpers
// ============================================================================

function createMockLLM(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
    return {
        complete: vi.fn().mockResolvedValue(
            JSON.stringify({
                description: "Need to process data",
                progress: 0.5,
                gaps: ["data not processed"],
                isComplete: false,
                sufferingDelta: -0.2,
                egoNoise: 0.1,
            }),
        ),
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        chat: vi.fn().mockResolvedValue({
            content: "DONE",
            toolCalls: undefined,
        } satisfies ChatResponse),
        ...overrides,
    };
}

function createMockTool(name = "test_tool"): Tool {
    return {
        name,
        description: "A test tool",
        parameters: {
            type: "object",
            properties: {
                input: { type: "string", description: "Test input" },
            },
            required: ["input"],
        },
        execute: vi.fn().mockResolvedValue({
            success: true,
            output: "tool result",
        }),
    };
}

// ============================================================================
// Tests
// ============================================================================

describe("Buddhist AI Metrics (Phase 0.5)", () => {
    // -----------------------------------------------------------------------
    // Observation type checks
    // -----------------------------------------------------------------------
    describe("Observation type", () => {
        it("should satisfy the Observation interface", () => {
            const obs: Observation = {
                data: { key: "value" },
                biasScore: 0.1,
                mindfulnessLevel: 0.9,
                observedAt: new Date(),
            };
            expect(obs.biasScore).toBe(0.1);
            expect(obs.mindfulnessLevel).toBe(0.9);
            expect(obs.data).toEqual({ key: "value" });
        });
    });

    // -----------------------------------------------------------------------
    // Delta backward compatibility
    // -----------------------------------------------------------------------
    describe("Delta backward compatibility", () => {
        it("should allow Delta without sufferingDelta/egoNoise (backward-compat)", () => {
            const delta: Delta = {
                description: "Working on it",
                progress: 0.5,
                gaps: ["something missing"],
                isComplete: false,
            };
            expect(delta.sufferingDelta).toBeUndefined();
            expect(delta.egoNoise).toBeUndefined();
        });

        it("should allow Delta with sufferingDelta and egoNoise", () => {
            const delta: Delta = {
                description: "Working on it",
                progress: 0.5,
                gaps: ["something missing"],
                isComplete: false,
                sufferingDelta: -0.3,
                egoNoise: 0.1,
            };
            expect(delta.sufferingDelta).toBe(-0.3);
            expect(delta.egoNoise).toBe(0.1);
        });
    });

    // -----------------------------------------------------------------------
    // observation:captured event
    // -----------------------------------------------------------------------
    describe("observation:captured event", () => {
        it("should emit observation:captured on each loop iteration", async () => {
            const llm = createMockLLM({
                complete: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        description: "Done",
                        progress: 1.0,
                        gaps: [],
                        isComplete: true,
                        sufferingDelta: -0.5,
                        egoNoise: 0.0,
                    }),
                ),
            });

            const agent = new ZenAgent({ goal: "Test observation", llm, maxSteps: 5 });
            const observationListener = vi.fn();
            agent.on("observation:captured", observationListener);

            await agent.run();

            expect(observationListener).toHaveBeenCalledTimes(1);
            expect(observationListener).toHaveBeenCalledWith(
                expect.objectContaining({
                    biasScore: expect.any(Number),
                    mindfulnessLevel: expect.any(Number),
                }),
            );
        });

        it("should have low biasScore when no failures occurred", async () => {
            const llm = createMockLLM({
                complete: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        description: "Done",
                        progress: 1.0,
                        gaps: [],
                        isComplete: true,
                    }),
                ),
            });

            const agent = new ZenAgent({ goal: "Test bias", llm, maxSteps: 5 });
            const observationListener = vi.fn();
            agent.on("observation:captured", observationListener);

            await agent.run();

            // No tanhaLoop detected → biasScore should be low
            expect(observationListener.mock.calls[0][0].biasScore).toBe(0.1);
            expect(observationListener.mock.calls[0][0].mindfulnessLevel).toBe(0.9);
        });
    });

    // -----------------------------------------------------------------------
    // dukkha:evaluated event
    // -----------------------------------------------------------------------
    describe("dukkha:evaluated event", () => {
        it("should emit dukkha:evaluated when LLM returns suffering metrics", async () => {
            let chatCallCount = 0;
            const llm = createMockLLM({
                complete: vi.fn()
                    .mockResolvedValueOnce(
                        JSON.stringify({
                            description: "Working",
                            progress: 0.5,
                            gaps: ["not done"],
                            isComplete: false,
                            sufferingDelta: -0.2,
                            egoNoise: 0.15,
                        }),
                    )
                    .mockResolvedValueOnce(
                        JSON.stringify({
                            description: "Done",
                            progress: 1.0,
                            gaps: [],
                            isComplete: true,
                            sufferingDelta: -0.5,
                            egoNoise: 0.0,
                        }),
                    ),
                chat: vi.fn().mockImplementation(() => {
                    chatCallCount++;
                    if (chatCallCount === 1) {
                        return Promise.resolve({
                            content: null,
                            toolCalls: [{
                                id: "call_1",
                                name: "test_tool",
                                arguments: { input: "hello" },
                            }],
                        });
                    }
                    return Promise.resolve({ content: "DONE", toolCalls: undefined });
                }),
            });

            const tool = createMockTool();
            const agent = new ZenAgent({ goal: "Test dukkha", llm, tools: [tool], maxSteps: 5 });
            const dukkhaListener = vi.fn();
            agent.on("dukkha:evaluated", dukkhaListener);

            await agent.run();

            // Should have been called at least once with suffering metrics
            expect(dukkhaListener).toHaveBeenCalled();
            const firstCall = dukkhaListener.mock.calls[0][0];
            expect(firstCall.sufferingDelta).toBe(-0.2);
            expect(firstCall.egoNoise).toBe(0.15);
        });

        it("should NOT emit dukkha:evaluated when LLM omits suffering metrics", async () => {
            const llm = createMockLLM({
                complete: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        description: "Done",
                        progress: 1.0,
                        gaps: [],
                        isComplete: true,
                        // No sufferingDelta or egoNoise
                    }),
                ),
            });

            const agent = new ZenAgent({ goal: "Test no dukkha", llm, maxSteps: 5 });
            const dukkhaListener = vi.fn();
            agent.on("dukkha:evaluated", dukkhaListener);

            await agent.run();

            // Should NOT be called (both fields must be present)
            expect(dukkhaListener).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // Tanha Loop Detection (渇愛ループ検出)
    // -----------------------------------------------------------------------
    describe("Tanha Loop Detection", () => {
        it("should detect tanhaLoop after 3 repeated same-pattern failures", async () => {
            let callCount = 0;
            const llm = createMockLLM({
                complete: vi.fn().mockResolvedValue(
                    JSON.stringify({
                        description: "Working",
                        progress: 0.2,
                        gaps: ["still failing"],
                        isComplete: false,
                        sufferingDelta: 0.3,
                        egoNoise: 0.5,
                    }),
                ),
                chat: vi.fn().mockImplementation(() => {
                    callCount++;
                    if (callCount > 5) {
                        return Promise.resolve({ content: "DONE", toolCalls: undefined });
                    }
                    return Promise.resolve({
                        content: null,
                        toolCalls: [{
                            id: `call_${callCount}`,
                            name: "failing_tool",
                            arguments: { input: "retry" },
                        }],
                    });
                }),
            });

            // Tool that always fails with same error
            const failingTool: Tool = {
                name: "failing_tool",
                description: "Always fails",
                parameters: { type: "object", properties: { input: { type: "string", description: "input" } } },
                execute: vi.fn().mockResolvedValue({
                    success: false,
                    output: null,
                    error: "connection_refused",
                }),
            };

            const failureDB = {
                store: vi.fn().mockResolvedValue(undefined),
                retrieve: vi.fn().mockResolvedValue([]),
                list: vi.fn().mockResolvedValue([]),
                exportCurrent: vi.fn().mockReturnValue([]),
            };

            const agent = new ZenAgent({
                goal: "Test tanha loop",
                llm,
                tools: [failingTool],
                failureDB,
                maxSteps: 6,
            });

            const observationListener = vi.fn();
            agent.on("observation:captured", observationListener);

            await agent.run();

            // After 3+ failures with same pattern, tanhaLoop should be detected
            // biasScore should be elevated (0.8) in later observations
            const lastObsCall = observationListener.mock.calls.at(-1)?.[0];
            if (observationListener.mock.calls.length > 3) {
                // After 3 failures: tanhaLoopDetected = true → biasScore should be 0.8
                expect(lastObsCall.biasScore).toBe(0.8);
                expect(lastObsCall.mindfulnessLevel).toBe(0.3);
            }
        });
    });
});
