// ============================================================================
// ZEN AI SDK — StateRecovery Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { StateRecovery } from "../src/state-recovery.js";
import type { AgentState } from "../src/types.js";

function createTestState(overrides: Partial<AgentState> = {}): AgentState {
    return {
        goal: { description: "Test goal" },
        currentMilestoneIndex: 0,
        stepCount: 5,
        snapshot: { resources: {}, context: {} },
        delta: { progress: 0.5, gaps: ["gap1"], description: "In progress", isComplete: false },
        failures: [],
        startedAt: "2025-01-01T00:00:00.000Z",
        lastUpdatedAt: "2025-01-01T00:01:00.000Z",
        ...overrides,
    };
}

describe("StateRecovery", () => {
    let tmpDir: string;
    let filePath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-test-"));
        filePath = path.join(tmpDir, "state.json");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should save and load state", () => {
        const recovery = new StateRecovery({ filePath });
        const state = createTestState();

        recovery.save(state);
        const loaded = recovery.load();

        expect(loaded).not.toBeNull();
        expect(loaded!.goal.description).toBe("Test goal");
        expect(loaded!.stepCount).toBe(5);
        expect(loaded!.delta?.progress).toBe(0.5);
    });

    it("should return null when no state file exists", () => {
        const recovery = new StateRecovery({ filePath });
        expect(recovery.load()).toBeNull();
    });

    it("should clear saved state", () => {
        const recovery = new StateRecovery({ filePath });
        recovery.save(createTestState());
        expect(recovery.exists()).toBe(true);

        recovery.clear();
        expect(recovery.exists()).toBe(false);
        expect(recovery.load()).toBeNull();
    });

    it("should report exists correctly", () => {
        const recovery = new StateRecovery({ filePath });
        expect(recovery.exists()).toBe(false);

        recovery.save(createTestState());
        expect(recovery.exists()).toBe(true);
    });

    it("should create directory if it does not exist", () => {
        const deepPath = path.join(tmpDir, "deep", "nested", "state.json");
        const recovery = new StateRecovery({ filePath: deepPath });

        recovery.save(createTestState());
        expect(recovery.exists()).toBe(true);
    });

    it("should throttle writes with writeIntervalMs", async () => {
        const recovery = new StateRecovery({
            filePath,
            writeIntervalMs: 200,
        });

        recovery.save(createTestState({ stepCount: 1 }));
        recovery.save(createTestState({ stepCount: 2 })); // Should be throttled

        const loaded = recovery.load();
        expect(loaded!.stepCount).toBe(1); // First write wins

        // Wait for interval
        await new Promise((r) => setTimeout(r, 250));
        recovery.save(createTestState({ stepCount: 3 }));

        const loaded2 = recovery.load();
        expect(loaded2!.stepCount).toBe(3);
    });

    it("should handle corrupted JSON gracefully", () => {
        const recovery = new StateRecovery({ filePath });
        fs.writeFileSync(filePath, "not-valid-json{{{", "utf-8");

        expect(recovery.load()).toBeNull();
    });

    it("should preserve null delta", () => {
        const recovery = new StateRecovery({ filePath });
        recovery.save(createTestState({ delta: null }));

        const loaded = recovery.load();
        expect(loaded!.delta).toBeNull();
    });
});
