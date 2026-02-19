// ============================================================================
// ZEN AI Runtime — 色 (Rūpa / Form)
// The physical body: PID management, signal handling, lifecycle.
// ============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { DaemonState } from "./types.js";

/**
 * ZenDaemon — Process lifecycle manager.
 *
 * Manages PID files, signal handlers, and persistent daemon state.
 * This is the "Form" (色) of the runtime — the physical vessel.
 */
export class ZenDaemon {
    private pidFile: string;
    private stateFile: string;
    private state: DaemonState;
    private startTime: number;
    private shutdownHandlers: Array<() => Promise<void> | void> = [];
    private signalsRegistered = false;

    constructor(stateDir: string) {
        if (!existsSync(stateDir)) {
            mkdirSync(stateDir, { recursive: true });
        }
        this.pidFile = join(stateDir, "daemon.pid");
        this.stateFile = join(stateDir, "daemon.state.json");
        this.startTime = Date.now();

        this.state = {
            pid: process.pid,
            startedAt: new Date().toISOString(),
            tasksExecuted: 0,
            tasksFailed: 0,
            lastHeartbeat: new Date().toISOString(),
            uptimeSeconds: 0,
        };

        // Load previous state if exists (for metrics continuity)
        this.loadState();
    }

    /** Start the daemon: write PID, register signals. */
    async start(): Promise<void> {
        // Check for existing PID file (duplicate instance prevention)
        if (existsSync(this.pidFile)) {
            const existingPid = parseInt(readFileSync(this.pidFile, "utf-8").trim(), 10);
            if (this.isProcessRunning(existingPid)) {
                throw new Error(
                    `Another ZEN runtime instance is already running (PID: ${existingPid}). ` +
                    `Kill it first or remove ${this.pidFile}`,
                );
            }
            // Stale PID file — remove it
            unlinkSync(this.pidFile);
        }

        // Write PID file
        const dir = dirname(this.pidFile);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(this.pidFile, String(process.pid), "utf-8");

        // Reset state for new session
        this.state.pid = process.pid;
        this.state.startedAt = new Date().toISOString();
        this.startTime = Date.now();
        this.saveState();

        // Register signal handlers (once)
        if (!this.signalsRegistered) {
            this.registerSignals();
            this.signalsRegistered = true;
        }
    }

    /** Stop the daemon: cleanup PID, run shutdown handlers. */
    async stop(): Promise<void> {
        // Run all shutdown handlers
        for (const handler of this.shutdownHandlers) {
            try {
                await handler();
            } catch {
                // Best-effort shutdown
            }
        }

        // Save final state
        this.updateUptime();
        this.saveState();

        // Remove PID file
        if (existsSync(this.pidFile)) {
            unlinkSync(this.pidFile);
        }
    }

    /** Register a shutdown handler. */
    onShutdown(handler: () => Promise<void> | void): void {
        this.shutdownHandlers.push(handler);
    }

    /** Update heartbeat timestamp. */
    heartbeat(): void {
        this.state.lastHeartbeat = new Date().toISOString();
        this.updateUptime();
    }

    /** Record a completed task. */
    recordTaskCompleted(): void {
        this.state.tasksExecuted++;
        this.saveState();
    }

    /** Record a failed task. */
    recordTaskFailed(): void {
        this.state.tasksFailed++;
        this.saveState();
    }

    /** Check if the daemon is running (via PID file). */
    isRunning(): boolean {
        if (!existsSync(this.pidFile)) return false;
        const pid = parseInt(readFileSync(this.pidFile, "utf-8").trim(), 10);
        return this.isProcessRunning(pid);
    }

    /** Get the current daemon state. */
    getState(): Readonly<DaemonState> {
        this.updateUptime();
        return { ...this.state };
    }

    // --- Private helpers ---

    private updateUptime(): void {
        this.state.uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    }

    private isProcessRunning(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private registerSignals(): void {
        const gracefulShutdown = async (signal: string) => {
            console.log(`\n🧘 ZEN Runtime received ${signal}. Shutting down gracefully...`);
            await this.stop();
            process.exit(0);
        };

        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

        // Handle uncaught errors — save state before crashing
        process.on("uncaughtException", (err) => {
            console.error("💀 Uncaught exception:", err.message);
            this.saveState();
        });
    }

    private saveState(): void {
        try {
            writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), "utf-8");
        } catch {
            // Best-effort
        }
    }

    private loadState(): void {
        try {
            if (existsSync(this.stateFile)) {
                const raw = readFileSync(this.stateFile, "utf-8");
                const loaded = JSON.parse(raw) as Partial<DaemonState>;
                // Carry over cumulative stats
                this.state.tasksExecuted = loaded.tasksExecuted ?? 0;
                this.state.tasksFailed = loaded.tasksFailed ?? 0;
            }
        } catch {
            // Start fresh
        }
    }
}
