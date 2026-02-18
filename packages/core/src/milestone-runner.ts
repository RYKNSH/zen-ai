// ============================================================================
// ZEN AI SDK — Milestone Runner
// "Reset. Don't accumulate."
// ============================================================================

import type {
    Milestone,
    MilestoneStatus,
    FailureEntry,
    Snapshot,
    LLMAdapter,
    Goal,
} from "./types.js";

/** Configuration for the MilestoneRunner. */
export interface MilestoneRunnerConfig {
    /** Ordered list of milestones to progress through. */
    milestones: Milestone[];
    /** Called when a context reset occurs. */
    onReset?: (knowledge: FailureEntry[]) => Promise<void> | void;
}

/**
 * MilestoneRunner — Manages milestone progression and context resets.
 *
 * When a milestone is reached, it triggers a context reset:
 * - Chat history is cleared
 * - Only failure knowledge survives the reset
 * - Resources from completed milestones remain accessible
 */
export class MilestoneRunner {
    private milestones: Milestone[];
    private statuses: MilestoneStatus[];
    private currentIndex = 0;
    private onReset?: (knowledge: FailureEntry[]) => Promise<void> | void;

    constructor(config: MilestoneRunnerConfig) {
        this.milestones = config.milestones;
        this.onReset = config.onReset;
        this.statuses = config.milestones.map((m) => ({
            milestone: m,
            reached: false,
        }));
    }

    /** Get the current milestone (or null if all are complete). */
    get current(): Milestone | null {
        return this.milestones[this.currentIndex] ?? null;
    }

    /** Get the index of the current milestone. */
    get currentMilestoneIndex(): number {
        return this.currentIndex;
    }

    /** Set the current milestone index (for state recovery). */
    set currentMilestoneIndex(index: number) {
        this.currentIndex = Math.min(index, this.milestones.length);
    }

    /** Get all milestone statuses. */
    get allStatuses(): MilestoneStatus[] {
        return [...this.statuses];
    }

    /** Check if all milestones have been reached. */
    get isComplete(): boolean {
        return this.currentIndex >= this.milestones.length;
    }

    /**
     * Check whether the current milestone has been reached.
     * Uses a two-phase check:
     *   1. Rule-based: Are all required resources present in the snapshot?
     *   2. LLM-based: Does the LLM confirm the milestone is satisfied?
     */
    async checkReached(
        snapshot: Snapshot,
        llm: LLMAdapter,
        goal: Goal,
    ): Promise<boolean> {
        const current = this.current;
        if (!current) return false;

        // Phase 1: Rule-based resource check
        const resourcesPresent = current.resources.every((resource) => {
            return this.findResource(snapshot, resource);
        });

        if (!resourcesPresent) return false;

        // Phase 2: LLM confirmation
        const prompt = [
            `Goal: ${goal.description}`,
            `Current milestone: "${current.description}"`,
            `Required resources: ${current.resources.join(", ")}`,
            `Current snapshot: ${JSON.stringify(snapshot, null, 2)}`,
            "",
            "Has this milestone been reached? Answer only YES or NO.",
        ].join("\n");

        const response = await llm.complete(prompt);
        return response.trim().toUpperCase().startsWith("YES");
    }

    /** Maximum retries for reset callback. */
    private static readonly RESET_MAX_RETRIES = 3;

    /**
     * Perform a context reset after a milestone is reached.
     * Returns the next milestone (or null if done).
     * Retries the onReset callback up to 3 times on failure.
     */
    async reset(failures: FailureEntry[]): Promise<Milestone | null> {
        const current = this.current;
        if (!current) return null;

        // Mark current milestone as reached
        this.statuses[this.currentIndex] = {
            milestone: current,
            reached: true,
            reachedAt: new Date(),
        };

        // Advance to next milestone
        this.currentIndex++;

        // Invoke reset callback with retry
        if (this.onReset) {
            let lastError: Error | undefined;
            for (
                let attempt = 1;
                attempt <= MilestoneRunner.RESET_MAX_RETRIES;
                attempt++
            ) {
                try {
                    await this.onReset(failures);
                    lastError = undefined;
                    break;
                } catch (error) {
                    lastError =
                        error instanceof Error
                            ? error
                            : new Error(String(error));
                    // Exponential backoff: 100ms, 200ms, 400ms
                    const delay = 100 * Math.pow(2, attempt - 1);
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
            if (lastError) {
                throw new Error(
                    `Reset callback failed after ${MilestoneRunner.RESET_MAX_RETRIES} retries: ${lastError.message}`,
                );
            }
        }

        return this.current;
    }

    /** Search the snapshot for a named resource. */
    private findResource(snapshot: Snapshot, resource: string): boolean {
        const snapshotStr = JSON.stringify(snapshot);
        return snapshotStr.includes(resource);
    }

    /** Serialize state for recovery. */
    toJSON(): { currentIndex: number; statuses: MilestoneStatus[] } {
        return {
            currentIndex: this.currentIndex,
            statuses: this.statuses,
        };
    }

    /** Restore state from serialized data. */
    static fromJSON(
        config: MilestoneRunnerConfig,
        data: { currentIndex: number },
    ): MilestoneRunner {
        const runner = new MilestoneRunner(config);
        runner.currentIndex = data.currentIndex;
        return runner;
    }
}
