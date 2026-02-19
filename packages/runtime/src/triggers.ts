// ============================================================================
// ZEN AI Runtime — 受 (Vedanā / Sensation)
// External stimuli: cron schedules, file watchers, interval timers.
// ============================================================================

import { watch, type FSWatcher } from "node:fs";
import type { TriggerDef, TaskDef } from "./types.js";

/**
 * Parse a simple cron expression and check if it matches the current time.
 * Supports: "* * * * *" (minute hour dayOfMonth month dayOfWeek)
 */
function matchesCron(pattern: string, now: Date): boolean {
    const parts = pattern.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const fields = [
        now.getMinutes(),   // 0
        now.getHours(),     // 1
        now.getDate(),      // 2
        now.getMonth() + 1, // 3
        now.getDay(),       // 4
    ];

    for (let i = 0; i < 5; i++) {
        const part = parts[i];
        if (part === "*") continue;

        // Handle step values: */5
        if (part.startsWith("*/")) {
            const step = parseInt(part.slice(2), 10);
            if (isNaN(step) || step <= 0) return false;
            if (fields[i] % step !== 0) return false;
            continue;
        }

        // Handle comma-separated: 1,15,30
        const values = part.split(",").map((v) => parseInt(v, 10));
        if (!values.includes(fields[i])) return false;
    }

    return true;
}

/**
 * TriggerSystem — Event triggers that enqueue tasks.
 *
 * This is the "Sensation" (受) of the runtime — it receives stimuli
 * from the outside world and translates them into tasks.
 */
export class TriggerSystem {
    private triggers: Map<string, TriggerDef> = new Map();
    private intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
    private watchers: Map<string, FSWatcher> = new Map();
    private onTrigger: (trigger: TriggerDef) => void;
    private cronCheckInterval: ReturnType<typeof setInterval> | null = null;
    private lastCronCheck: Map<string, number> = new Map();

    constructor(onTrigger: (trigger: TriggerDef) => void) {
        this.onTrigger = onTrigger;
    }

    /** Register a trigger. */
    addTrigger(trigger: TriggerDef): void {
        this.triggers.set(trigger.id, trigger);
        if (!trigger.enabled) return;

        switch (trigger.type) {
            case "interval":
                this.setupInterval(trigger);
                break;
            case "file_watch":
                this.setupFileWatch(trigger);
                break;
            case "cron":
                // Cron triggers are checked in the cron check loop
                break;
        }
    }

    /** Remove a trigger. */
    removeTrigger(id: string): void {
        this.triggers.delete(id);

        const interval = this.intervals.get(id);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(id);
        }

        const watcher = this.watchers.get(id);
        if (watcher) {
            watcher.close();
            this.watchers.delete(id);
        }
    }

    /** Start the cron check loop. */
    startCronLoop(): void {
        if (this.cronCheckInterval) return;

        // Check every 60 seconds
        this.cronCheckInterval = setInterval(() => {
            this.checkCronTriggers();
        }, 60_000);

        // Also check immediately
        this.checkCronTriggers();
    }

    /** Stop all triggers and cleanup. */
    stop(): void {
        if (this.cronCheckInterval) {
            clearInterval(this.cronCheckInterval);
            this.cronCheckInterval = null;
        }

        for (const interval of this.intervals.values()) {
            clearInterval(interval);
        }
        this.intervals.clear();

        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();
    }

    /** Get all registered triggers. */
    getTriggers(): TriggerDef[] {
        return Array.from(this.triggers.values());
    }

    // --- Private helpers ---

    private setupInterval(trigger: TriggerDef): void {
        const ms = parseInt(trigger.pattern, 10);
        if (isNaN(ms) || ms <= 0) return;

        const interval = setInterval(() => {
            this.onTrigger(trigger);
        }, ms);
        this.intervals.set(trigger.id, interval);
    }

    private setupFileWatch(trigger: TriggerDef): void {
        try {
            const watcher = watch(trigger.pattern, { persistent: false }, () => {
                this.onTrigger(trigger);
            });
            this.watchers.set(trigger.id, watcher);
        } catch {
            // File/dir may not exist yet — silently skip
        }
    }

    private checkCronTriggers(): void {
        const now = new Date();
        const currentMinute = Math.floor(now.getTime() / 60_000);

        for (const trigger of this.triggers.values()) {
            if (trigger.type !== "cron" || !trigger.enabled) continue;

            // Prevent double-firing within the same minute
            const lastFired = this.lastCronCheck.get(trigger.id) ?? 0;
            if (lastFired === currentMinute) continue;

            if (matchesCron(trigger.pattern, now)) {
                this.lastCronCheck.set(trigger.id, currentMinute);
                this.onTrigger(trigger);
            }
        }
    }
}

/** Create a unique task ID. */
export function createTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a TaskDef from a TriggerDef. */
export function taskFromTrigger(trigger: TriggerDef): TaskDef {
    return {
        id: createTaskId(),
        goal: trigger.task.goal,
        priority: trigger.task.priority,
        maxSteps: trigger.task.maxSteps,
        createdAt: new Date().toISOString(),
        status: "pending",
    };
}
