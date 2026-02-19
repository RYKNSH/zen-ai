// ============================================================================
// ZEN AI Runtime — Tests
// 五蘊 (Skandha) module tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ZenDaemon } from "../src/daemon.js";
import { TriggerSystem, createTaskId, taskFromTrigger } from "../src/triggers.js";
import { HealthMonitor } from "../src/monitor.js";
import { TaskScheduler } from "../src/scheduler.js";
import type { TaskDef, TriggerDef } from "../src/types.js";

const TEST_STATE_DIR = ".zen-runtime-test";

function cleanup() {
    if (existsSync(TEST_STATE_DIR)) {
        rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// 色 (Rūpa) — ZenDaemon
// ---------------------------------------------------------------------------

describe("ZenDaemon (色 / Form)", () => {
    beforeEach(cleanup);
    afterEach(cleanup);

    it("should start and create PID file", async () => {
        const daemon = new ZenDaemon(TEST_STATE_DIR);
        await daemon.start();
        expect(existsSync(join(TEST_STATE_DIR, "daemon.pid"))).toBe(true);

        const pid = readFileSync(join(TEST_STATE_DIR, "daemon.pid"), "utf-8");
        expect(parseInt(pid, 10)).toBe(process.pid);

        await daemon.stop();
    });

    it("should remove PID file on stop", async () => {
        const daemon = new ZenDaemon(TEST_STATE_DIR);
        await daemon.start();
        await daemon.stop();
        expect(existsSync(join(TEST_STATE_DIR, "daemon.pid"))).toBe(false);
    });

    it("should persist and load state", async () => {
        const daemon = new ZenDaemon(TEST_STATE_DIR);
        await daemon.start();
        daemon.recordTaskCompleted();
        daemon.recordTaskCompleted();
        daemon.recordTaskFailed();
        await daemon.stop();

        // New daemon should load cumulative stats
        const daemon2 = new ZenDaemon(TEST_STATE_DIR);
        const state = daemon2.getState();
        expect(state.tasksExecuted).toBe(2);
        expect(state.tasksFailed).toBe(1);
    });

    it("should detect duplicate instance", async () => {
        const daemon = new ZenDaemon(TEST_STATE_DIR);
        await daemon.start();

        const daemon2 = new ZenDaemon(TEST_STATE_DIR);
        await expect(daemon2.start()).rejects.toThrow("already running");

        await daemon.stop();
    });

    it("should update heartbeat", async () => {
        const daemon = new ZenDaemon(TEST_STATE_DIR);
        await daemon.start();
        const before = daemon.getState().lastHeartbeat;
        await new Promise((r) => setTimeout(r, 10));
        daemon.heartbeat();
        const after = daemon.getState().lastHeartbeat;
        expect(after).not.toBe(before);
        await daemon.stop();
    });
});

// ---------------------------------------------------------------------------
// 受 (Vedanā) — TriggerSystem
// ---------------------------------------------------------------------------

describe("TriggerSystem (受 / Sensation)", () => {
    it("should fire interval triggers", async () => {
        let fired = false;
        const system = new TriggerSystem(() => { fired = true; });

        const trigger: TriggerDef = {
            id: "test-interval",
            type: "interval",
            pattern: "50", // 50ms
            task: { goal: "Test", priority: 5 },
            enabled: true,
        };

        system.addTrigger(trigger);
        await new Promise((r) => setTimeout(r, 100));
        system.stop();

        expect(fired).toBe(true);
    });

    it("should not fire disabled triggers", async () => {
        let fired = false;
        const system = new TriggerSystem(() => { fired = true; });

        const trigger: TriggerDef = {
            id: "disabled",
            type: "interval",
            pattern: "10",
            task: { goal: "Test", priority: 5 },
            enabled: false,
        };

        system.addTrigger(trigger);
        await new Promise((r) => setTimeout(r, 50));
        system.stop();

        expect(fired).toBe(false);
    });

    it("should create unique task IDs", () => {
        const ids = new Set(Array.from({ length: 100 }, () => createTaskId()));
        expect(ids.size).toBe(100);
    });

    it("should create TaskDef from TriggerDef", () => {
        const trigger: TriggerDef = {
            id: "t1",
            type: "cron",
            pattern: "0 9 * * *",
            task: { goal: "Morning check", priority: 1, maxSteps: 20 },
            enabled: true,
        };

        const task = taskFromTrigger(trigger);
        expect(task.goal).toBe("Morning check");
        expect(task.priority).toBe(1);
        expect(task.maxSteps).toBe(20);
        expect(task.status).toBe("pending");
    });

    it("should remove triggers", () => {
        const system = new TriggerSystem(() => { });
        system.addTrigger({
            id: "rm-test",
            type: "interval",
            pattern: "1000",
            task: { goal: "Test", priority: 5 },
            enabled: true,
        });

        expect(system.getTriggers()).toHaveLength(1);
        system.removeTrigger("rm-test");
        expect(system.getTriggers()).toHaveLength(0);
        system.stop();
    });
});

// ---------------------------------------------------------------------------
// 想 (Saṃjñā) — HealthMonitor
// ---------------------------------------------------------------------------

describe("HealthMonitor (想 / Perception)", () => {
    it("should return healthy status for normal operation", () => {
        const monitor = new HealthMonitor(1024);
        const metrics = monitor.checkHealth();
        expect(metrics.health).toBe("healthy");
        expect(metrics.memoryUsageMB).toBeGreaterThan(0);
        expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it("should track task counters", () => {
        const monitor = new HealthMonitor();
        monitor.recordTaskCompleted();
        monitor.recordTaskCompleted();
        monitor.recordTaskFailed();
        const metrics = monitor.checkHealth();
        expect(metrics.tasksCompleted).toBe(2);
        expect(metrics.tasksFailed).toBe(1);
    });

    it("should track queue length", () => {
        const monitor = new HealthMonitor();
        monitor.setQueueLength(5);
        const metrics = monitor.checkHealth();
        expect(metrics.queueLength).toBe(5);
    });

    it("should fire degraded handler when memory exceeds limit", () => {
        // Use a very low limit to trigger degraded
        const monitor = new HealthMonitor(1); // 1MB limit
        let degradedFired = false;
        monitor.onDegraded(() => { degradedFired = true; });
        monitor.checkHealth();
        expect(degradedFired).toBe(true);
    });

    it("should return last metrics", () => {
        const monitor = new HealthMonitor(1024);
        expect(monitor.getLastMetrics()).toBeNull();
        monitor.checkHealth();
        expect(monitor.getLastMetrics()).not.toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 行 (Saṃskāra) — TaskScheduler
// ---------------------------------------------------------------------------

describe("TaskScheduler (行 / Formation)", () => {
    beforeEach(cleanup);
    afterEach(cleanup);

    function makeTask(overrides: Partial<TaskDef> = {}): TaskDef {
        return {
            id: createTaskId(),
            goal: "Test task",
            priority: 5,
            createdAt: new Date().toISOString(),
            status: "pending",
            ...overrides,
        };
    }

    it("should enqueue and dequeue tasks", () => {
        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        const task = makeTask({ goal: "Do something" });
        scheduler.enqueue(task);
        expect(scheduler.length).toBe(1);

        const dequeued = scheduler.dequeue();
        expect(dequeued).not.toBeNull();
        expect(dequeued!.goal).toBe("Do something");
        expect(dequeued!.status).toBe("running");
    });

    it("should dequeue by priority (lowest number first)", () => {
        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        scheduler.enqueue(makeTask({ goal: "Low priority", priority: 10 }));
        scheduler.enqueue(makeTask({ goal: "High priority", priority: 1 }));
        scheduler.enqueue(makeTask({ goal: "Medium priority", priority: 5 }));

        const first = scheduler.dequeue();
        expect(first!.goal).toBe("High priority");
    });

    it("should mark tasks as completed", () => {
        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        const task = makeTask();
        scheduler.enqueue(task);
        scheduler.dequeue();
        scheduler.complete(task.id, 10);

        expect(scheduler.length).toBe(0);
        const history = scheduler.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].status).toBe("done");
        expect(history[0].stepsExecuted).toBe(10);
    });

    it("should mark tasks as failed", () => {
        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        const task = makeTask();
        scheduler.enqueue(task);
        scheduler.dequeue();
        scheduler.fail(task.id, "Something broke");

        const history = scheduler.getHistory();
        expect(history[0].status).toBe("failed");
        expect(history[0].error).toBe("Something broke");
    });

    it("should persist and restore queue", () => {
        const scheduler1 = new TaskScheduler(TEST_STATE_DIR);
        scheduler1.enqueue(makeTask({ goal: "Persistent task" }));
        scheduler1.persist();

        const scheduler2 = new TaskScheduler(TEST_STATE_DIR);
        const pending = scheduler2.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].goal).toBe("Persistent task");
    });

    it("should recover running tasks as pending (crash recovery)", () => {
        // Simulate crash: write a queue file with a "running" task
        mkdirSync(TEST_STATE_DIR, { recursive: true });
        const task = makeTask({ status: "running", goal: "Was running" });
        writeFileSync(
            join(TEST_STATE_DIR, "task-queue.json"),
            JSON.stringify({ queue: [task], history: [] }),
            "utf-8",
        );

        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        const pending = scheduler.getPending();
        expect(pending).toHaveLength(1);
        expect(pending[0].status).toBe("pending");
        expect(pending[0].goal).toBe("Was running");
    });

    it("should prevent duplicate enqueue of same goal", () => {
        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        scheduler.enqueue(makeTask({ goal: "Same goal" }));
        scheduler.enqueue(makeTask({ goal: "Same goal" }));
        expect(scheduler.length).toBe(1);
    });

    it("should change priority", () => {
        const scheduler = new TaskScheduler(TEST_STATE_DIR);
        const task1 = makeTask({ goal: "Task A", priority: 10 });
        const task2 = makeTask({ goal: "Task B", priority: 5 });
        scheduler.enqueue(task1);
        scheduler.enqueue(task2);

        scheduler.prioritize(task1.id, 1);
        const first = scheduler.dequeue();
        expect(first!.goal).toBe("Task A");
    });
});
