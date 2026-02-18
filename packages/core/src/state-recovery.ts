// ============================================================================
// ZEN AI SDK — State Recovery
// Persist and restore agent state for crash recovery.
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentState } from "./types.js";

/** Options for state persistence. */
export interface StateRecoveryOptions {
    /** File path for state persistence. */
    filePath: string;
    /** Write interval in milliseconds. Default: every step. */
    writeIntervalMs?: number;
}

/**
 * StateRecovery — Persist agent state to disk for crash recovery.
 *
 * Usage:
 * ```ts
 * const recovery = new StateRecovery({ filePath: "./agent-state.json" });
 * agent.on("action:complete", () => recovery.save(agent.getState()));
 * // On restart:
 * const saved = recovery.load();
 * ```
 */
export class StateRecovery {
    private filePath: string;
    private lastWriteTime = 0;
    private writeIntervalMs: number;

    constructor(options: StateRecoveryOptions) {
        this.filePath = path.resolve(options.filePath);
        this.writeIntervalMs = options.writeIntervalMs ?? 0;

        // Ensure directory exists
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /** Save agent state to disk. Throttled by writeIntervalMs. */
    save(state: AgentState): void {
        const now = Date.now();
        if (now - this.lastWriteTime < this.writeIntervalMs) {
            return; // Throttled
        }

        fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), "utf-8");
        this.lastWriteTime = now;
    }

    /** Load saved state from disk. Returns null if no state file exists. */
    load(): AgentState | null {
        if (!fs.existsSync(this.filePath)) {
            return null;
        }

        try {
            const raw = fs.readFileSync(this.filePath, "utf-8");
            return JSON.parse(raw) as AgentState;
        } catch {
            return null;
        }
    }

    /** Delete the saved state file. */
    clear(): void {
        if (fs.existsSync(this.filePath)) {
            fs.unlinkSync(this.filePath);
        }
    }

    /** Check if a saved state exists. */
    exists(): boolean {
        return fs.existsSync(this.filePath);
    }
}
