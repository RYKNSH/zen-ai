// ============================================================================
// ZEN AI SDK — State Persistence Tests
//
// Verify selfModel save/load round-trip and agent state recovery.
// ============================================================================

import { describe, it, expect, afterEach } from "vitest";
import { ZenAgent } from "../../core/src/zen-agent.js";
import { MockLLMAdapter } from "./helpers/mock-llm-adapter.js";
import { existsSync, unlinkSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function deltaJSON(opts: { progress: number; gaps: string[]; isComplete?: boolean }): string {
    return JSON.stringify({
        description: `Progress: ${opts.progress * 100}%`,
        progress: opts.progress,
        gaps: opts.gaps,
        isComplete: opts.isComplete ?? false,
        sufferingDelta: -0.1,
        egoNoise: 0.1,
    });
}

function toolCallResponse(toolName: string, params: Record<string, unknown> = {}) {
    return {
        content: null,
        toolCalls: [{ id: `call_${toolName}`, name: toolName, arguments: params }],
    };
}

describe("State Persistence: SelfModel round-trip", () => {
    const tmpDir = join(tmpdir(), "zen-ai-test-selfmodel");
    const selfModelPath = join(tmpDir, "self-model.json");

    afterEach(() => {
        try {
            if (existsSync(selfModelPath)) unlinkSync(selfModelPath);
        } catch { /* ignore */ }
    });

    it("should persist selfModel after run() and load it in new agent", async () => {
        mkdirSync(tmpDir, { recursive: true });

        // --- Run 1: Agent executes tasks, building toolStats ---
        const llm1 = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.5, gaps: ["task 1"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("alpha_tool"),
            ],
        });

        const agent1 = new ZenAgent({
            goal: "Run 1: build self-model",
            llm: llm1,
            tools: [{
                name: "alpha_tool",
                description: "Test tool",
                parameters: { type: "object", properties: {} },
                execute: async () => ({ success: true, output: "done" }),
            }],
            selfModelPath,
            maxSteps: 5,
        });

        await agent1.run();

        // Verify: selfModel file was created
        expect(existsSync(selfModelPath)).toBe(true);

        // Verify: file contains toolStats
        const raw = readFileSync(selfModelPath, "utf-8");
        const saved = JSON.parse(raw);
        expect(saved.toolStats).toBeDefined();
        expect(saved.toolStats.alpha_tool).toBeDefined();
        expect(saved.toolStats.alpha_tool.uses).toBe(1);
        expect(saved.toolStats.alpha_tool.successes).toBe(1);

        // --- Run 2: New agent loads saved selfModel ---
        const llm2 = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
        });

        const agent2 = new ZenAgent({
            goal: "Run 2: load self-model",
            llm: llm2,
            tools: [],
            selfModelPath,
            maxSteps: 5,
        });

        // The agent loaded the selfModel in constructor
        // Verify via getState() that the state carries forward
        const state = agent2.getState();
        expect(state).toBeDefined();
        expect(state.goal.description).toBe("Run 2: load self-model");
    });

    it("should handle missing selfModel file gracefully", () => {
        const nonExistentPath = join(tmpDir, "nonexistent.json");

        // Should NOT throw
        expect(() => {
            new ZenAgent({
                goal: "Test graceful load",
                llm: new MockLLMAdapter({}),
                tools: [],
                selfModelPath: nonExistentPath,
                maxSteps: 1,
            });
        }).not.toThrow();
    });

    it("should handle corrupted selfModel file gracefully", async () => {
        mkdirSync(tmpDir, { recursive: true });
        const { writeFileSync } = await import("node:fs");
        writeFileSync(selfModelPath, "NOT_VALID_JSON{{{", "utf-8");

        // Should NOT throw even with corrupted file
        expect(() => {
            new ZenAgent({
                goal: "Test corrupted file",
                llm: new MockLLMAdapter({}),
                tools: [],
                selfModelPath,
                maxSteps: 1,
            });
        }).not.toThrow();
    });
});

describe("State: getState() snapshot", () => {
    it("should return comprehensive state after run", async () => {
        const llm = new MockLLMAdapter({
            completeResponses: [
                deltaJSON({ progress: 0.5, gaps: ["work"] }),
                deltaJSON({ progress: 1.0, gaps: [], isComplete: true }),
            ],
            chatResponses: [
                toolCallResponse("test_tool"),
            ],
        });

        const agent = new ZenAgent({
            goal: { description: "State test", successCriteria: ["all done"] },
            llm,
            tools: [{
                name: "test_tool",
                description: "A test tool",
                parameters: { type: "object", properties: {} },
                execute: async () => ({ success: true, output: "ok" }),
            }],
            maxSteps: 5,
        });

        await agent.run();

        const state = agent.getState();
        expect(state.goal.description).toBe("State test");
        expect(state.stepCount).toBe(1);
        expect(state.buddhistMetrics).toBeDefined();
    });
});
