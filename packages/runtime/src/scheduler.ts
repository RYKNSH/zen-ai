// ============================================================================
// ZEN AI Runtime — 行 (Saṃskāra / Formation)
// Will formation: task queue, priority management, persistence.
// ============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TaskDef } from "./types.js";

/**
 * TaskScheduler — Priority task queue with persistence.
 *
 * This is the "Formation" (行) of the runtime — it shapes intention
 * into ordered action, deciding what to do next.
 */
export class TaskScheduler {
    private queue: TaskDef[] = [];
    private history: TaskDef[] = [];
    private persistPath: string;
    private maxHistory = 100;

    constructor(stateDir: string) {
        this.persistPath = join(stateDir, "task-queue.json");
        this.restore();
    }

    /** Add a task to the queue. */
    enqueue(task: TaskDef): string {
        // Don't add duplicates (same goal, pending)
        const existing = this.queue.find(
            (t) => t.goal === task.goal && t.status === "pending",
        );
        if (existing) return existing.id;

        this.queue.push(task);
        this.sortByPriority();
        this.persist();
        return task.id;
    }

    /** Get the next pending task (highest priority). */
    dequeue(): TaskDef | null {
        const idx = this.queue.findIndex((t) => t.status === "pending");
        if (idx === -1) return null;

        this.queue[idx].status = "running";
        this.persist();
        return this.queue[idx];
    }

    /** Mark a task as completed. */
    complete(taskId: string, stepsExecuted: number): void {
        const task = this.queue.find((t) => t.id === taskId);
        if (task) {
            task.status = "done";
            task.completedAt = new Date().toISOString();
            task.stepsExecuted = stepsExecuted;
            this.moveToHistory(task);
        }
        this.persist();
    }

    /** Mark a task as failed. */
    fail(taskId: string, error: string): void {
        const task = this.queue.find((t) => t.id === taskId);
        if (task) {
            task.status = "failed";
            task.error = error;
            task.completedAt = new Date().toISOString();
            this.moveToHistory(task);
        }
        this.persist();
    }

    /** Get all pending tasks. */
    getPending(): TaskDef[] {
        return this.queue.filter((t) => t.status === "pending");
    }

    /** Get the full queue (all statuses). */
    getQueue(): TaskDef[] {
        return [...this.queue];
    }

    /** Get task history. */
    getHistory(): TaskDef[] {
        return [...this.history];
    }

    /** Get queue length (pending only). */
    get length(): number {
        return this.queue.filter((t) => t.status === "pending").length;
    }

    /** Change the priority of a task. */
    prioritize(taskId: string, priority: number): void {
        const task = this.queue.find((t) => t.id === taskId);
        if (task) {
            task.priority = priority;
            this.sortByPriority();
            this.persist();
        }
    }

    // --- Persistence ---

    /** Save queue to disk. */
    persist(): void {
        try {
            const dir = dirname(this.persistPath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(
                this.persistPath,
                JSON.stringify({ queue: this.queue, history: this.history }, null, 2),
                "utf-8",
            );
        } catch {
            // Best-effort
        }
    }

    /** Restore queue from disk. */
    restore(): void {
        try {
            if (existsSync(this.persistPath)) {
                const raw = readFileSync(this.persistPath, "utf-8");
                const data = JSON.parse(raw) as { queue: TaskDef[]; history: TaskDef[] };
                // Recover: reset any "running" tasks back to "pending" (crash recovery)
                this.queue = (data.queue ?? []).map((t) => ({
                    ...t,
                    status: t.status === "running" ? "pending" : t.status,
                })) as TaskDef[];
                this.history = data.history ?? [];
                this.sortByPriority();
            }
        } catch {
            this.queue = [];
            this.history = [];
        }
    }

    // --- Private helpers ---

    private sortByPriority(): void {
        this.queue.sort((a, b) => a.priority - b.priority);
    }

    private moveToHistory(task: TaskDef): void {
        this.queue = this.queue.filter((t) => t.id !== task.id);
        this.history.push(task);
        // Trim history
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(-this.maxHistory);
        }
    }
}
