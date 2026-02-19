// ============================================================================
// ZEN AI Runtime — 想 (Saṃjñā / Perception)
// Self-awareness: health checks, metrics, watchdog.
// ============================================================================

import type { RuntimeMetrics, HealthStatus } from "./types.js";

/**
 * HealthMonitor — Self-perception of the runtime.
 *
 * This is the "Perception" (想) of the runtime — it observes its own
 * state and detects when something is wrong.
 */
export class HealthMonitor {
    private startTime: number;
    private tasksCompleted = 0;
    private tasksFailed = 0;
    private queueLength = 0;
    private memoryLimitMB: number;
    private degradedHandlers: Array<(metrics: RuntimeMetrics, reason: string) => void> = [];
    private lastMetrics: RuntimeMetrics | null = null;

    constructor(memoryLimitMB = 512) {
        this.startTime = Date.now();
        this.memoryLimitMB = memoryLimitMB;
    }

    /** Perform a health check and return metrics. */
    checkHealth(): RuntimeMetrics {
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
        const heapTotalMB = memUsage.heapTotal / (1024 * 1024);
        const heapPercent = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB) * 100 : 0;

        const metrics: RuntimeMetrics = {
            health: this.determineHealth(heapUsedMB, heapPercent),
            memoryUsageMB: Math.round(heapUsedMB * 100) / 100,
            heapUsagePercent: Math.round(heapPercent * 100) / 100,
            uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
            queueLength: this.queueLength,
            tasksCompleted: this.tasksCompleted,
            tasksFailed: this.tasksFailed,
            timestamp: new Date().toISOString(),
        };

        this.lastMetrics = metrics;

        // Fire degraded handlers
        if (metrics.health === "degraded" || metrics.health === "unhealthy") {
            const reason = this.getDegradedReason(heapUsedMB, heapPercent);
            for (const handler of this.degradedHandlers) {
                try { handler(metrics, reason); } catch { /* swallow */ }
            }
        }

        return metrics;
    }

    /** Get the last metrics without re-checking. */
    getLastMetrics(): RuntimeMetrics | null {
        return this.lastMetrics;
    }

    /** Register a handler for degraded/unhealthy state. */
    onDegraded(handler: (metrics: RuntimeMetrics, reason: string) => void): void {
        this.degradedHandlers.push(handler);
    }

    /** Update task counters. */
    recordTaskCompleted(): void {
        this.tasksCompleted++;
    }

    recordTaskFailed(): void {
        this.tasksFailed++;
    }

    setQueueLength(length: number): void {
        this.queueLength = length;
    }

    // --- Private helpers ---

    private determineHealth(heapMB: number, heapPercent: number): HealthStatus {
        if (heapMB > this.memoryLimitMB || heapPercent > 95) return "unhealthy";
        if (heapMB > this.memoryLimitMB * 0.8 || heapPercent > 85) return "degraded";
        return "healthy";
    }

    private getDegradedReason(heapMB: number, heapPercent: number): string {
        const reasons: string[] = [];
        if (heapMB > this.memoryLimitMB) reasons.push(`heap ${Math.round(heapMB)}MB > limit ${this.memoryLimitMB}MB`);
        if (heapPercent > 85) reasons.push(`heap usage ${heapPercent.toFixed(1)}%`);
        return reasons.join(", ") || "unknown";
    }
}
