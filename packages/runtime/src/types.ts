// ============================================================================
// ZEN AI Runtime — Type Definitions
// 五蘊 (Skandha): The five aggregates that form the autonomous body.
// ============================================================================

// ---------------------------------------------------------------------------
// Task Definition
// ---------------------------------------------------------------------------

/** A task to be executed by the runtime. */
export interface TaskDef {
    /** Unique task ID. */
    id: string;
    /** Goal description for the ZenAgent. */
    goal: string;
    /** Priority (0 = highest). */
    priority: number;
    /** Cron expression for recurring tasks (optional). */
    schedule?: string;
    /** Maximum steps for this task. */
    maxSteps?: number;
    /** When this task was created. */
    createdAt: string;
    /** Current status. */
    status: "pending" | "running" | "done" | "failed";
    /** Error message if failed. */
    error?: string;
    /** When this task completed or failed. */
    completedAt?: string;
    /** Number of steps executed. */
    stepsExecuted?: number;
}

// ---------------------------------------------------------------------------
// Daemon State
// ---------------------------------------------------------------------------

/** Persistent daemon state (survives restarts). */
export interface DaemonState {
    /** Process ID. */
    pid: number;
    /** When the daemon started. */
    startedAt: string;
    /** Total tasks executed. */
    tasksExecuted: number;
    /** Total tasks failed. */
    tasksFailed: number;
    /** Last heartbeat timestamp. */
    lastHeartbeat: string;
    /** Uptime in seconds. */
    uptimeSeconds: number;
}

// ---------------------------------------------------------------------------
// Health & Metrics
// ---------------------------------------------------------------------------

/** Runtime health status. */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/** Runtime metrics snapshot. */
export interface RuntimeMetrics {
    /** Current health. */
    health: HealthStatus;
    /** Memory usage in MB. */
    memoryUsageMB: number;
    /** Heap usage percentage. */
    heapUsagePercent: number;
    /** Uptime in seconds. */
    uptimeSeconds: number;
    /** Tasks in queue. */
    queueLength: number;
    /** Tasks completed. */
    tasksCompleted: number;
    /** Tasks failed. */
    tasksFailed: number;
    /** Timestamp of this snapshot. */
    timestamp: string;
}

// ---------------------------------------------------------------------------
// Trigger Definition
// ---------------------------------------------------------------------------

/** Types of triggers that can enqueue tasks. */
export type TriggerType = "cron" | "interval" | "file_watch";

/** A trigger that enqueues tasks. */
export interface TriggerDef {
    /** Unique trigger ID. */
    id: string;
    /** Trigger type. */
    type: TriggerType;
    /** Cron pattern or glob pattern or interval ms. */
    pattern: string;
    /** Task to enqueue when triggered. */
    task: Omit<TaskDef, "id" | "createdAt" | "status">;
    /** Whether this trigger is active. */
    enabled: boolean;
}

// ---------------------------------------------------------------------------
// Orchestrator Configuration
// ---------------------------------------------------------------------------

/** Configuration for the ZenOrchestrator. */
export interface OrchestratorConfig {
    /** Directory for state files. Default: ".zen-runtime". */
    stateDir?: string;
    /** OpenAI API key. Defaults to OPENAI_API_KEY env var. */
    openaiApiKey?: string;
    /** Default max steps per task. Default: 50. */
    defaultMaxSteps?: number;
    /** Main loop interval in ms. Default: 5000. */
    loopIntervalMs?: number;
    /** Health check interval in ms. Default: 30000. */
    healthCheckIntervalMs?: number;
    /** Memory limit in MB before triggering GC warning. Default: 512. */
    memoryLimitMB?: number;
    /** File paths for SkillDB persistence. */
    skillDBPath?: string;
    /** File paths for FailureDB persistence. */
    failureDBPath?: string;
    /** Triggers to register on boot. */
    triggers?: TriggerDef[];
    /** Additional tools for agents. */
    tools?: import("@zen-ai/core").Tool[];
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** Events emitted by the runtime. */
export interface RuntimeEvents {
    "runtime:boot": { pid: number; stateDir: string };
    "runtime:shutdown": { reason: string; tasksCompleted: number };
    "task:enqueued": { task: TaskDef };
    "task:started": { task: TaskDef };
    "task:completed": { task: TaskDef; stepsExecuted: number };
    "task:failed": { task: TaskDef; error: string };
    "trigger:fired": { trigger: TriggerDef };
    "health:check": { metrics: RuntimeMetrics };
    "health:degraded": { metrics: RuntimeMetrics; reason: string };
}
