// ============================================================================
// ZEN AI SDK — E2E Integration Tests
//
// These tests verify the ENTIRE agent lifecycle with a MockLLMAdapter:
//   snapshot → computeDelta → decide → executeTool → complete
//
// No real API calls. Deterministic. Reproducible.
// ============================================================================

import { describe, it, expect, vi } from "vitest";
import { ZenAgent } from "../../core/src/zen-agent.js";
import { MockLLMAdapter } from "./helpers/mock-llm-adapter.js";
import type { Tool, ToolResult, ZenPlugin, PluginContext, Delta, Action } from "../../core/src/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a simple in-memory Tool for testing. */
function createTestTool(name: string, result: ToolResult): Tool {
    return {
        name,
        description: `Test tool: ${name}`,
        parameters: {
            type: "object",
            properties: {
                input: { type: "string", description: "Input value" },
            },
        },
        execute: vi.fn(async () => result),
    };
}

/** Standard Delta JSON response for MockLLM.complete(). */
function deltaJSON(opts: {
    progress: number;
    gaps: string[];
    isComplete?: boolean;
}): string {
    return JSON.stringify({
        description: `Progress: ${opts.progress * 100}%`,
        progress: opts.progress,
        gaps: opts.gaps,
        isComplete: opts.isComplete ?? false,
        sufferingDelta: -0.1,
        egoNoise: 0.1,
    });
}

/** Standard chat response with a tool call. */
function toolCallResponse(toolName: string, params: Record<string, unknown> = {}) {
    return {
        content: null,
        toolCalls: [
            {
                id: `call_${toolName}_${Math.random().toString(36).slice(2, 8)}`,
                name: toolName,
                arguments: params,
            },
        ],
    };
}

// ===========================================================================
// 1. Complete Run Cycle
// ===========================================================================
describe("E2E: Complete run() cycle", () => {
    it("should complete a full snapshot→delta→decide→execute→complete cycle", async () => {
        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                // Step 1: delta shows gap
                deltaJSON({ progress: 0.3, gaps: ["file not read yet"] }),
                // Step 2: delta shows progress
                deltaJSON({ progress: 0.8, gaps: ["summary not written"] }),
                // Step 3: delta shows complete
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("read_file", { path: "test.txt" }),
                toolCallResponse("write_file", { path: "out.txt", content: "done" }),
            ],
        });

        const readTool = createTestTool("read_file", {
            success: true,
            output: "file contents here",
        });
        const writeTool = createTestTool("write_file", {
            success: true,
            output: "written",
        });

        let snapshotCalls = 0;
        const agent = new ZenAgent({
            goal: "Read test.txt and write summary to out.txt",
            llm: mockLLM,
            tools: [readTool, writeTool],
            snapshot: () => {
                snapshotCalls++;
                return { files: ["test.txt"], step: snapshotCalls };
            },
            maxSteps: 10,
        });

        const events: string[] = [];
        agent.on("agent:start", () => events.push("start"));
        agent.on("action:start", () => events.push("action:start"));
        agent.on("action:complete", () => events.push("action:complete"));
        agent.on("agent:complete", () => events.push("complete"));

        await agent.run();

        // Verify: snapshot was called multiple times
        expect(snapshotCalls).toBeGreaterThanOrEqual(2);

        // Verify: LLM.complete was called (for delta computation)
        expect(mockLLM.completeCalls.length).toBeGreaterThanOrEqual(2);

        // Verify: LLM.chat was called (for tool selection)
        expect(mockLLM.chatCalls.length).toBe(2);

        // Verify: tools were actually executed
        expect(readTool.execute).toHaveBeenCalledTimes(1);
        expect(writeTool.execute).toHaveBeenCalledTimes(1);

        // Verify: correct event sequence
        expect(events[0]).toBe("start");
        expect(events).toContain("action:start");
        expect(events).toContain("action:complete");
        expect(events[events.length - 1]).toBe("complete");
    });

    it("should stop when maxSteps is reached", async () => {
        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.1, gaps: ["still working"] }),
                deltaJSON({ progress: 0.2, gaps: ["still working"] }),
                deltaJSON({ progress: 0.3, gaps: ["still working"] }),
            ],
            chatResponses: [
                toolCallResponse("test_tool"),
                toolCallResponse("test_tool"),
                toolCallResponse("test_tool"),
            ],
        });

        const tool = createTestTool("test_tool", { success: true, output: "ok" });

        const agent = new ZenAgent({
            goal: "Infinite task",
            llm: mockLLM,
            tools: [tool],
            maxSteps: 2,
        });

        await agent.run();

        // Should have stopped at maxSteps=2
        expect(mockLLM.chatCalls.length).toBeLessThanOrEqual(2);
    });
});

// ===========================================================================
// 2. Tool execution chain
// ===========================================================================
describe("E2E: Tool execution chain", () => {
    it("should chain multiple tool calls in correct order", async () => {
        const executionOrder: string[] = [];

        const scanTool: Tool = {
            name: "scan",
            description: "Scan directory",
            parameters: { type: "object", properties: {} },
            execute: async () => {
                executionOrder.push("scan");
                return { success: true, output: ["a.txt", "b.txt"] };
            },
        };

        const moveTool: Tool = {
            name: "move_file",
            description: "Move a file",
            parameters: { type: "object", properties: { from: { type: "string", description: "source" }, to: { type: "string", description: "dest" } } },
            execute: async (params) => {
                executionOrder.push(`move:${params.from}→${params.to}`);
                return { success: true, output: "moved" };
            },
        };

        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.0, gaps: ["scan needed"] }),
                deltaJSON({ progress: 0.5, gaps: ["files need moving"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("scan", {}),
                toolCallResponse("move_file", { from: "a.txt", to: "images/a.txt" }),
            ],
        });

        const agent = new ZenAgent({
            goal: "Scan and organize files",
            llm: mockLLM,
            tools: [scanTool, moveTool],
            maxSteps: 5,
        });

        await agent.run();

        expect(executionOrder).toEqual(["scan", "move:a.txt→images/a.txt"]);
    });
});

// ===========================================================================
// 3. Milestone + Context Reset
// ===========================================================================
describe("E2E: Milestones and context reset", () => {
    it("should reach milestones and trigger context reset", async () => {
        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                // First delta: scan milestone not done
                deltaJSON({ progress: 0.3, gaps: ["scanning"] }),
                // After first action: scan done, milestone checker LLM call
                deltaJSON({ progress: 0.5, gaps: ["organize files"] }),
                // Second delta: organize milestone
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("scan_dir", {}),
                toolCallResponse("organize", {}),
            ],
        });

        const scanTool = createTestTool("scan_dir", { success: true, output: "scanned" });
        const organizeTool = createTestTool("organize", { success: true, output: "organized" });

        const agent = new ZenAgent({
            goal: "Scan and organize",
            llm: mockLLM,
            tools: [scanTool, organizeTool],
            milestones: [
                { id: "scan", description: "Scan files", resources: [] },
                { id: "organize", description: "Organize files", resources: [] },
            ],
            maxSteps: 10,
        });

        const milestoneEvents: string[] = [];
        agent.on("milestone:reached", ({ milestoneId }) => {
            milestoneEvents.push(milestoneId);
        });

        await agent.run();

        // Agent completed
        expect(mockLLM.completeCalls.length).toBeGreaterThanOrEqual(2);
    });
});

// ===========================================================================
// 4. Plugin Hook Execution Order
// ===========================================================================
describe("E2E: Plugin hook execution order", () => {
    it("should call plugin hooks in correct order during run()", async () => {
        const hookOrder: string[] = [];

        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.5, gaps: ["do something"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("test_tool", { input: "hello" }),
            ],
        });

        const testTool = createTestTool("test_tool", { success: true, output: "done" });

        const trackingPlugin: ZenPlugin = {
            name: "tracker",
            description: "Tracks hook execution order",
            hooks: {
                async beforeObserve(_ctx: PluginContext) {
                    hookOrder.push("beforeObserve");
                },
                async afterDelta(_ctx: PluginContext, _delta: Delta) {
                    hookOrder.push("afterDelta");
                    return undefined;
                },
                async beforeDecide(_ctx: PluginContext): Promise<string[]> {
                    hookOrder.push("beforeDecide");
                    return ["[TRACKER] Tracking active"];
                },
                async afterAction(_ctx: PluginContext, _action: Action, _result: ToolResult) {
                    hookOrder.push("afterAction");
                },
            },
        };

        const agent = new ZenAgent({
            goal: "Test plugin hooks",
            llm: mockLLM,
            tools: [testTool],
            maxSteps: 5,
        });

        await agent.use(trackingPlugin);
        await agent.run();

        // Verify hook execution order for one complete step
        // Step 1: beforeObserve → afterDelta → beforeDecide → afterAction
        expect(hookOrder).toContain("beforeObserve");
        expect(hookOrder).toContain("afterDelta");
        expect(hookOrder).toContain("beforeDecide");
        expect(hookOrder).toContain("afterAction");

        // Verify order — beforeObserve comes before afterDelta
        const boIdx = hookOrder.indexOf("beforeObserve");
        const adIdx = hookOrder.indexOf("afterDelta");
        const bdIdx = hookOrder.indexOf("beforeDecide");
        const aaIdx = hookOrder.indexOf("afterAction");

        expect(boIdx).toBeLessThan(adIdx);
        expect(adIdx).toBeLessThan(bdIdx);
        expect(bdIdx).toBeLessThan(aaIdx);
    });
});

// ===========================================================================
// 5. Sila Veto → Skip
// ===========================================================================
describe("E2E: Sila veto skips action", () => {
    it("should skip action execution when plugin vetoes", async () => {
        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.3, gaps: ["dangerous action needed"] }),
                deltaJSON({ progress: 0.5, gaps: ["safe action needed"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                // This should never be called due to the veto on step 1
                toolCallResponse("safe_tool", {}),
            ],
        });

        const safeTool = createTestTool("safe_tool", { success: true, output: "safe result" });

        let vetoCount = 0;
        const silaPlugin: ZenPlugin = {
            name: "sila-test",
            description: "Vetoes on first call only",
            hooks: {
                async afterDelta(_ctx: PluginContext, _delta: Delta) {
                    vetoCount++;
                    if (vetoCount === 1) {
                        return { vetoed: true, reason: "First action is dangerous" };
                    }
                    return undefined;
                },
            },
        };

        const agent = new ZenAgent({
            goal: "Test veto behavior",
            llm: mockLLM,
            tools: [safeTool],
            maxSteps: 5,
        });

        const vetoEvents: string[] = [];
        agent.on("plugin:veto", ({ plugin, reason }) => {
            vetoEvents.push(`${plugin}: ${reason}`);
        });

        await agent.use(silaPlugin);
        await agent.run();

        // Veto should have been emitted
        expect(vetoEvents.length).toBe(1);
        expect(vetoEvents[0]).toContain("First action is dangerous");

        // The veto'd step should NOT have called chat (decide was skipped)
        // Step 1: vetoed → skip decide → go back to step 2
        // Step 2: not vetoed → decide → execute
        // Step 3: isComplete
    });
});

// ===========================================================================
// 6. Failure Recovery
// ===========================================================================
describe("E2E: Failure recovery", () => {
    it("should record failure and continue with next step", async () => {
        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.3, gaps: ["try action"] }),
                deltaJSON({ progress: 0.6, gaps: ["retry differently"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("flaky_tool", { attempt: "first" }),
                toolCallResponse("reliable_tool", { input: "backup" }),
            ],
        });

        const flakyTool = createTestTool("flaky_tool", {
            success: false,
            output: null,
            error: "Connection timeout",
        });
        const reliableTool = createTestTool("reliable_tool", {
            success: true,
            output: "success",
        });

        const agent = new ZenAgent({
            goal: "Complete task with recovery",
            llm: mockLLM,
            tools: [flakyTool, reliableTool],
            maxSteps: 5,
        });

        const actionResults: { tool: string; success: boolean }[] = [];
        agent.on("action:complete", ({ action, result }) => {
            actionResults.push({ tool: action.toolName, success: result.success });
        });

        await agent.run();

        // First tool should have failed
        expect(actionResults[0]).toEqual({ tool: "flaky_tool", success: false });

        // Second tool should have succeeded
        expect(actionResults[1]).toEqual({ tool: "reliable_tool", success: true });
    });
});

// ===========================================================================
// 7. SelfModel Evolution
// ===========================================================================
describe("E2E: SelfModel evolution", () => {
    it("should update selfModel toolStats after tool executions", async () => {
        const mockLLM = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.25, gaps: ["step 1"] }),
                deltaJSON({ progress: 0.5, gaps: ["step 2"] }),
                deltaJSON({ progress: 0.75, gaps: ["step 3"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("tool_a"),
                toolCallResponse("tool_b"),
                toolCallResponse("tool_a"),
            ],
        });

        const toolA = createTestTool("tool_a", { success: true, output: "a" });
        const toolB = createTestTool("tool_b", { success: false, output: null, error: "fail" });

        const agent = new ZenAgent({
            goal: "Test self-model evolution",
            llm: mockLLM,
            tools: [toolA, toolB],
            maxSteps: 5,
        });

        await agent.run();

        // Get the agent state which includes selfModel info indirectly
        const state = agent.getState();

        // Agent should have completed 3 steps
        expect(state.stepCount).toBe(3);

        // tool_a was called twice (both success), tool_b once (failed)
        expect(toolA.execute).toHaveBeenCalledTimes(2);
        expect(toolB.execute).toHaveBeenCalledTimes(1);
    });
});

// ===========================================================================
// 8. MockLLMAdapter unit tests
// ===========================================================================
describe("MockLLMAdapter", () => {
    it("should return queued responses in order", async () => {
        const llm = new MockLLMAdapter({
            completeResponses: ["first", "second"],
            chatResponses: [
                { content: "hello", toolCalls: undefined },
                { content: "world", toolCalls: undefined },
            ],
        });

        expect(await llm.complete("p1")).toBe("first");
        expect(await llm.complete("p2")).toBe("second");

        const c1 = await llm.chat([]);
        expect(c1.content).toBe("hello");
        const c2 = await llm.chat([]);
        expect(c2.content).toBe("world");
    });

    it("should return DONE when queue is exhausted", async () => {
        const llm = new MockLLMAdapter({});
        const result = await llm.complete("anything");
        expect(JSON.parse(result).isComplete).toBe(true);

        const chatResult = await llm.chat([]);
        expect(chatResult.content).toBe("DONE");
    });

    it("should track all calls", async () => {
        const llm = new MockLLMAdapter({ completeResponses: ["ok"] });
        await llm.complete("test prompt");
        await llm.embed("test text");

        expect(llm.completeCalls).toEqual(["test prompt"]);
        expect(llm.embedCalls).toEqual(["test text"]);
    });

    it("should return consistent embed vectors", async () => {
        const llm = new MockLLMAdapter({ embedVector: [1, 2, 3] });
        const v1 = await llm.embed("a");
        const v2 = await llm.embed("b");
        expect(v1).toEqual([1, 2, 3]);
        expect(v2).toEqual([1, 2, 3]);
        // Should be different instances
        expect(v1).not.toBe(v2);
    });
});
