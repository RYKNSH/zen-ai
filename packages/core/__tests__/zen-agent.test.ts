import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZenAgent } from "../src/zen-agent.js";
import type { LLMAdapter, Tool, ChatResponse } from "../src/types.js";

/** Create a mock LLM adapter. */
function createMockLLM(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
    return {
        complete: vi.fn().mockResolvedValue(
            JSON.stringify({
                description: "Need to process data",
                progress: 0.5,
                gaps: ["data not processed"],
                isComplete: false,
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

/** Create a mock tool. */
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

describe("ZenAgent", () => {
    it("should normalize string goal to Goal object", () => {
        const llm = createMockLLM();
        const agent = new ZenAgent({ goal: "Test goal", llm });
        const state = agent.getState();
        expect(state.goal.description).toBe("Test goal");
    });

    it("should emit agent:start and agent:complete events", async () => {
        const llm = createMockLLM({
            complete: vi.fn().mockResolvedValue(
                JSON.stringify({
                    description: "All done",
                    progress: 1.0,
                    gaps: [],
                    isComplete: true,
                }),
            ),
        });

        const agent = new ZenAgent({ goal: "Test goal", llm, maxSteps: 5 });

        const startListener = vi.fn();
        const completeListener = vi.fn();
        agent.on("agent:start", startListener);
        agent.on("agent:complete", completeListener);

        await agent.run();

        expect(startListener).toHaveBeenCalledOnce();
        expect(completeListener).toHaveBeenCalledOnce();
        expect(completeListener).toHaveBeenCalledWith(
            expect.objectContaining({ goal: { description: "Test goal" } }),
        );
    });

    it("should stop when delta reports isComplete", async () => {
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

        const agent = new ZenAgent({ goal: "Finish", llm, maxSteps: 100 });
        await agent.run();
        const state = agent.getState();
        expect(state.stepCount).toBe(0); // Should stop before any steps
    });

    it("should stop at maxSteps", async () => {
        let callCount = 0;
        const llm = createMockLLM({
            complete: vi.fn().mockResolvedValue(
                JSON.stringify({
                    description: "Working...",
                    progress: 0.1,
                    gaps: ["not done"],
                    isComplete: false,
                }),
            ),
            chat: vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount > 3) {
                    return Promise.resolve({ content: "DONE", toolCalls: undefined });
                }
                return Promise.resolve({
                    content: null,
                    toolCalls: [
                        {
                            id: `call_${callCount}`,
                            name: "test_tool",
                            arguments: { input: "test" },
                        },
                    ],
                });
            }),
        });

        const tool = createMockTool();
        const agent = new ZenAgent({
            goal: "Work",
            llm,
            tools: [tool],
            maxSteps: 3,
        });

        await agent.run();
        const state = agent.getState();
        expect(state.stepCount).toBeLessThanOrEqual(3);
    });

    it("should call tool when LLM returns tool call", async () => {
        let chatCallCount = 0;
        const llm = createMockLLM({
            chat: vi.fn().mockImplementation(() => {
                chatCallCount++;
                if (chatCallCount === 1) {
                    return Promise.resolve({
                        content: "Using tool",
                        toolCalls: [
                            {
                                id: "call_1",
                                name: "test_tool",
                                arguments: { input: "hello" },
                            },
                        ],
                    });
                }
                return Promise.resolve({ content: "DONE", toolCalls: undefined });
            }),
        });

        const tool = createMockTool();
        const agent = new ZenAgent({
            goal: "Use a tool",
            llm,
            tools: [tool],
            maxSteps: 5,
        });

        const actionListener = vi.fn();
        agent.on("action:complete", actionListener);

        await agent.run();

        expect(tool.execute).toHaveBeenCalledWith({ input: "hello" });
        expect(actionListener).toHaveBeenCalledWith(
            expect.objectContaining({
                action: expect.objectContaining({ toolName: "test_tool" }),
                result: expect.objectContaining({ success: true }),
            }),
        );
    });

    it("should prevent concurrent runs", async () => {
        const llm = createMockLLM({
            complete: vi.fn().mockImplementation(
                () =>
                    new Promise((resolve) =>
                        setTimeout(
                            () =>
                                resolve(
                                    JSON.stringify({
                                        description: "Working",
                                        progress: 0.5,
                                        gaps: ["busy"],
                                        isComplete: false,
                                    }),
                                ),
                            100,
                        ),
                    ),
            ),
            chat: vi.fn().mockResolvedValue({ content: "DONE" }),
        });

        const agent = new ZenAgent({ goal: "Test", llm, maxSteps: 1 });
        const run1 = agent.run();
        await expect(agent.run()).rejects.toThrow("already running");
        await run1;
    });

    it("should stop gracefully with stop()", async () => {
        let chatCallCount = 0;
        const llm = createMockLLM({
            chat: vi.fn().mockImplementation(() => {
                chatCallCount++;
                return Promise.resolve({
                    content: null,
                    toolCalls: [
                        {
                            id: `call_${chatCallCount}`,
                            name: "test_tool",
                            arguments: { input: "x" },
                        },
                    ],
                });
            }),
        });

        const tool = createMockTool();
        const agent = new ZenAgent({
            goal: "Keep going",
            llm,
            tools: [tool],
            maxSteps: 100,
        });

        // Stop after 2 action events
        let actionCount = 0;
        agent.on("action:complete", () => {
            actionCount++;
            if (actionCount >= 2) agent.stop();
        });

        await agent.run();
        expect(actionCount).toBe(2);
    });

    it("should collect artifacts from successful tool executions", async () => {
        let chatCallCount = 0;
        const llm = createMockLLM({
            chat: vi.fn().mockImplementation(() => {
                chatCallCount++;
                if (chatCallCount === 1) {
                    return Promise.resolve({
                        content: "Using tool",
                        toolCalls: [
                            {
                                id: "call_1",
                                name: "test_tool",
                                arguments: { input: "hello" },
                            },
                        ],
                    });
                }
                return Promise.resolve({ content: "DONE", toolCalls: undefined });
            }),
        });

        const tool = createMockTool();
        const agent = new ZenAgent({
            goal: "Create something",
            llm,
            tools: [tool],
            maxSteps: 5,
        });

        await agent.run();
        const state = agent.getState();

        expect(state.artifacts).toHaveLength(1);
        expect(state.artifacts[0].toolName).toBe("test_tool");
        expect(state.artifacts[0].output).toBe("tool result");
        expect(state.artifacts[0].step).toBe(1);
    });

    it("should emit artifact:created event", async () => {
        let chatCallCount = 0;
        const llm = createMockLLM({
            chat: vi.fn().mockImplementation(() => {
                chatCallCount++;
                if (chatCallCount === 1) {
                    return Promise.resolve({
                        content: "Creating artifact",
                        toolCalls: [
                            {
                                id: "call_1",
                                name: "test_tool",
                                arguments: { input: "data" },
                            },
                        ],
                    });
                }
                return Promise.resolve({ content: "DONE", toolCalls: undefined });
            }),
        });

        const tool = createMockTool();
        const agent = new ZenAgent({
            goal: "Build",
            llm,
            tools: [tool],
            maxSteps: 5,
        });

        const artifactListener = vi.fn();
        agent.on("artifact:created", artifactListener);

        await agent.run();

        expect(artifactListener).toHaveBeenCalledOnce();
        expect(artifactListener).toHaveBeenCalledWith(
            expect.objectContaining({
                toolName: "test_tool",
                step: 1,
            }),
        );
    });

    it("should not create artifacts for failed tool executions", async () => {
        let chatCallCount = 0;
        const llm = createMockLLM({
            chat: vi.fn().mockImplementation(() => {
                chatCallCount++;
                if (chatCallCount === 1) {
                    return Promise.resolve({
                        content: "Trying",
                        toolCalls: [
                            {
                                id: "call_1",
                                name: "failing_tool",
                                arguments: { input: "x" },
                            },
                        ],
                    });
                }
                return Promise.resolve({ content: "DONE", toolCalls: undefined });
            }),
        });

        const failingTool: Tool = {
            name: "failing_tool",
            description: "A tool that fails",
            parameters: {
                type: "object",
                properties: {
                    input: { type: "string", description: "input" },
                },
            },
            execute: vi.fn().mockResolvedValue({
                success: false,
                output: null,
                error: "Something went wrong",
            }),
        };

        const agent = new ZenAgent({
            goal: "Try",
            llm,
            tools: [failingTool],
            maxSteps: 5,
        });

        await agent.run();
        const state = agent.getState();
        expect(state.artifacts).toHaveLength(0);
    });
});
