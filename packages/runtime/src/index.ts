// ============================================================================
// ZEN AI Runtime — Public API
// 五蘊 (Skandha): The five aggregates form the autonomous body.
//
// Usage:
//   import { ZenOrchestrator } from "@zen-ai/runtime";
//   const runtime = new ZenOrchestrator({ stateDir: ".zen-runtime" });
//   await runtime.boot();
//   runtime.enqueue("Analyze project health");
//   await runtime.runLoop();
// ============================================================================

export { ZenOrchestrator } from "./orchestrator.js";
export { ZenDaemon } from "./daemon.js";
export { TriggerSystem, createTaskId, taskFromTrigger } from "./triggers.js";
export { HealthMonitor } from "./monitor.js";
export { TaskScheduler } from "./scheduler.js";

export type {
    TaskDef,
    DaemonState,
    RuntimeMetrics,
    HealthStatus,
    TriggerDef,
    TriggerType,
    OrchestratorConfig,
    RuntimeEvents,
} from "./types.js";
