import { describe, it, expect, vi, beforeEach } from "vitest";
import { MilestoneRunner } from "../src/milestone-runner.js";
import type { LLMAdapter, Goal, FailureEntry } from "../src/types.js";

const mockLLM: LLMAdapter = {
    complete: vi.fn().mockResolvedValue("YES"),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    chat: vi.fn().mockResolvedValue({ content: "ok", toolCalls: undefined }),
};

const goal: Goal = { description: "Test Goal" };

describe("MilestoneRunner", () => {
    let runner: MilestoneRunner;

    beforeEach(() => {
        vi.clearAllMocks();
        runner = new MilestoneRunner({
            milestones: [
                { id: "m1", description: "Step 1", resources: ["file_a"] },
                { id: "m2", description: "Step 2", resources: ["file_b"] },
            ],
        });
    });

    it("should start at the first milestone", () => {
        expect(runner.current?.id).toBe("m1");
        expect(runner.currentMilestoneIndex).toBe(0);
        expect(runner.isComplete).toBe(false);
    });

    it("should detect milestone reached when resources exist", async () => {
        const snapshot = { files: ["file_a"] };
        const reached = await runner.checkReached(snapshot, mockLLM, goal);
        expect(reached).toBe(true);
    });

    it("should not reach milestone when resources are missing", async () => {
        const snapshot = { files: [] };
        const reached = await runner.checkReached(snapshot, mockLLM, goal);
        expect(reached).toBe(false);
        expect(mockLLM.complete).not.toHaveBeenCalled();
    });

    it("should not reach milestone when LLM says NO", async () => {
        (mockLLM.complete as ReturnType<typeof vi.fn>).mockResolvedValueOnce("NO");
        const snapshot = { files: ["file_a"] };
        const reached = await runner.checkReached(snapshot, mockLLM, goal);
        expect(reached).toBe(false);
    });

    it("should advance to next milestone on reset", async () => {
        const failures: FailureEntry[] = [];
        const next = await runner.reset(failures);
        expect(runner.currentMilestoneIndex).toBe(1);
        expect(next?.id).toBe("m2");
    });

    it("should mark complete when all milestones are done", async () => {
        await runner.reset([]);
        await runner.reset([]);
        expect(runner.isComplete).toBe(true);
        expect(runner.current).toBeNull();
    });

    it("should call onReset callback", async () => {
        const onReset = vi.fn();
        const runnerWithCallback = new MilestoneRunner({
            milestones: [
                { id: "m1", description: "Step 1", resources: ["a"] },
            ],
            onReset,
        });

        const failures: FailureEntry[] = [
            {
                id: "fk1",
                proverb: "Test proverb",
                condition: "When testing",
                severity: "LOW",
                source: "test",
            },
        ];

        await runnerWithCallback.reset(failures);
        expect(onReset).toHaveBeenCalledWith(failures);
    });

    it("should serialize and restore state", () => {
        const json = runner.toJSON();
        expect(json.currentIndex).toBe(0);

        const restored = MilestoneRunner.fromJSON(
            {
                milestones: [
                    { id: "m1", description: "Step 1", resources: ["a"] },
                    { id: "m2", description: "Step 2", resources: ["b"] },
                ],
            },
            { currentIndex: 1 },
        );
        expect(restored.currentMilestoneIndex).toBe(1);
        expect(restored.current?.id).toBe("m2");
    });
});
