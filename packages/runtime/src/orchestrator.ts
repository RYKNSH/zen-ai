// ============================================================================
// ZEN AI Runtime — 識 (Vijñāna / Consciousness)
// The integrating consciousness: agent lifecycle, task execution, main loop.
// ============================================================================

import { ZenAgent } from "@zen-ai/core";
import type { ZenAgentConfig, Tool, LLMAdapter } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import { SkillDB, FailureKnowledgeDB } from "@zen-ai/memory";
import { fileReadTool, fileWriteTool, httpTool } from "@zen-ai/tools";

import { ZenDaemon } from "./daemon.js";
import { TriggerSystem, taskFromTrigger, createTaskId } from "./triggers.js";
import { HealthMonitor } from "./monitor.js";
import { TaskScheduler } from "./scheduler.js";
import type { OrchestratorConfig, TaskDef, RuntimeMetrics, TriggerDef } from "./types.js";

/**
 * ZenOrchestrator — The unifying consciousness of the runtime.
 *
 * Integrates daemon (色), triggers (受), monitor (想), and scheduler (行)
 * into a coherent autonomous agent runtime.
 *
 * Usage:
 * ```ts
 * const runtime = new ZenOrchestrator({
 *     stateDir: ".zen-runtime",
 *     triggers: [
 *         { id: "morning", type: "cron", pattern: "0 9 * * *",
 *           task: { goal: "Check project health", priority: 1 }, enabled: true }
 *     ],
 * });
 * await runtime.boot();
 * await runtime.runLoop(); // Runs forever
 * ```
 */
export class ZenOrchestrator {
    private daemon: ZenDaemon;
    private triggers: TriggerSystem;
    private monitor: HealthMonitor;
    private scheduler: TaskScheduler;
    private config: Required<Pick<OrchestratorConfig, "defaultMaxSteps" | "loopIntervalMs" | "healthCheckIntervalMs" | "memoryLimitMB">> & OrchestratorConfig;

    private running = false;
    private currentAgent: ZenAgent | null = null;
    private healthInterval: ReturnType<typeof setInterval> | null = null;

    constructor(config: OrchestratorConfig = {}) {
        const stateDir = config.stateDir ?? ".zen-runtime";

        this.config = {
            defaultMaxSteps: 50,
            loopIntervalMs: 5000,
            healthCheckIntervalMs: 30_000,
            memoryLimitMB: 512,
            ...config,
            stateDir,
        };

        this.daemon = new ZenDaemon(stateDir);
        this.scheduler = new TaskScheduler(stateDir);
        this.monitor = new HealthMonitor(this.config.memoryLimitMB);

        // Trigger system: enqueue tasks when triggers fire
        this.triggers = new TriggerSystem((trigger: TriggerDef) => {
            const task = taskFromTrigger(trigger);
            this.scheduler.enqueue(task);
            console.log(`🔔 Trigger "${trigger.id}" fired → Task "${task.goal}" enqueued`);
        });
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /** Boot the runtime: initialize all modules. */
    async boot(): Promise<void> {
        console.log("🧘 ZEN AI Runtime booting...");

        // Start daemon (PID, signals)
        await this.daemon.start();

        // Register shutdown handler
        this.daemon.onShutdown(async () => {
            await this.shutdown("signal");
        });

        // Register triggers
        if (this.config.triggers) {
            for (const trigger of this.config.triggers) {
                this.triggers.addTrigger(trigger);
            }
        }
        this.triggers.startCronLoop();

        // Start health monitoring
        this.healthInterval = setInterval(() => {
            const metrics = this.monitor.checkHealth();
            if (metrics.health !== "healthy") {
                console.warn(`⚠️ Health: ${metrics.health} — Memory: ${metrics.memoryUsageMB}MB`);
            }
        }, this.config.healthCheckIntervalMs);

        this.running = true;
        console.log(`🧘 ZEN AI Runtime online (PID: ${process.pid})`);
    }

    /** Shut down the runtime gracefully. */
    async shutdown(reason = "manual"): Promise<void> {
        if (!this.running) return;
        this.running = false;

        console.log(`🧘 Shutting down (reason: ${reason})...`);

        // Stop current agent if running
        if (this.currentAgent) {
            this.currentAgent.stop();
            this.currentAgent = null;
        }

        // Stop health monitoring
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = null;
        }

        // Stop triggers
        this.triggers.stop();

        // Save scheduler state
        this.scheduler.persist();

        // Stop daemon (removes PID, saves state)
        await this.daemon.stop();

        console.log("🧘 ZEN AI Runtime stopped.");
    }

    /**
     * Run the autonomous main loop.
     * Continuously dequeues and executes tasks.
     */
    async runLoop(): Promise<void> {
        console.log("🔄 Autonomous loop started");

        while (this.running) {
            try {
                this.daemon.heartbeat();
                this.monitor.setQueueLength(this.scheduler.length);

                // Dequeue next task
                const task = this.scheduler.dequeue();
                if (task) {
                    await this.runTask(task);
                }

                // Sleep between iterations
                await this.sleep(this.config.loopIntervalMs);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                console.error(`❌ Loop error: ${msg}`);
                // Don't crash the loop — continue
                await this.sleep(this.config.loopIntervalMs * 2);
            }
        }

        console.log("🔄 Autonomous loop ended");
    }

    /** Enqueue a task manually. */
    enqueue(goal: string, options: { priority?: number; maxSteps?: number } = {}): string {
        const task: TaskDef = {
            id: createTaskId(),
            goal,
            priority: options.priority ?? 5,
            maxSteps: options.maxSteps ?? this.config.defaultMaxSteps,
            createdAt: new Date().toISOString(),
            status: "pending",
        };
        this.scheduler.enqueue(task);
        console.log(`📋 Task enqueued: "${goal}" (priority: ${task.priority})`);
        return task.id;
    }

    /** Run a single task immediately (bypass queue). */
    async runTaskImmediate(goal: string, maxSteps?: number): Promise<void> {
        const task: TaskDef = {
            id: createTaskId(),
            goal,
            priority: 0,
            maxSteps: maxSteps ?? this.config.defaultMaxSteps,
            createdAt: new Date().toISOString(),
            status: "running",
        };
        await this.runTask(task);
    }

    /** Get runtime metrics. */
    getMetrics(): RuntimeMetrics {
        return this.monitor.checkHealth();
    }

    /** Get the task queue. */
    getQueue(): TaskDef[] {
        return this.scheduler.getQueue();
    }

    /** Get task execution history. */
    getHistory(): TaskDef[] {
        return this.scheduler.getHistory();
    }

    /** Check if the runtime is running. */
    isRunning(): boolean {
        return this.running;
    }

    // =========================================================================
    // Task Execution
    // =========================================================================

    /** Execute a single task by creating and running a ZenAgent. */
    private async runTask(task: TaskDef): Promise<void> {
        console.log(`\n🎯 Running task: "${task.goal}"`);
        const startTime = Date.now();

        try {
            // Create agent config
            const agentConfig = this.createAgentConfig(
                task.goal,
                task.maxSteps ?? this.config.defaultMaxSteps,
            );

            // Create and run agent
            const agent = new ZenAgent(agentConfig);
            this.currentAgent = agent;

            // Track progress
            agent.on("action:complete", ({ step }) => {
                if (step % 5 === 0) {
                    console.log(`  ⏳ Step ${step}...`);
                }
            });

            agent.on("milestone:reached", ({ milestoneId }) => {
                console.log(`  🏔️ Milestone reached: ${milestoneId}`);
            });

            await agent.run();

            // Success
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const state = agent.getState();
            this.scheduler.complete(task.id, state.stepCount);
            this.daemon.recordTaskCompleted();
            this.monitor.recordTaskCompleted();
            console.log(`✅ Task completed in ${state.stepCount} steps (${elapsed}s)`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.scheduler.fail(task.id, msg);
            this.daemon.recordTaskFailed();
            this.monitor.recordTaskFailed();
            console.error(`❌ Task failed: ${msg}`);
        } finally {
            this.currentAgent = null;
        }
    }

    /** Create a ZenAgentConfig from a goal. */
    private createAgentConfig(goal: string, maxSteps: number): ZenAgentConfig {
        const apiKey = this.config.openaiApiKey ?? process.env.OPENAI_API_KEY;
        const llm: LLMAdapter = new OpenAIAdapter(apiKey ? { apiKey } : undefined);

        const tools: Tool[] = [
            fileReadTool,
            fileWriteTool,
            httpTool,
            ...(this.config.tools ?? []),
        ];

        const config: ZenAgentConfig = {
            goal,
            llm,
            tools,
            maxSteps,
        };

        if (this.config.skillDBPath) {
            config.skillDB = new SkillDB({
                persistPath: this.config.skillDBPath,
                llm,
            });
        }

        if (this.config.failureDBPath) {
            config.failureDB = new FailureKnowledgeDB({
                persistPath: this.config.failureDBPath,
                llm,
            });
        }

        return config;
    }

    // --- Helpers ---

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
