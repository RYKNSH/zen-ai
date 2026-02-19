// ============================================================================
// ZEN AI Runtime — Entry Point
// Starts the autonomous orchestrator.
//Usage: node dist/start.js
// ============================================================================

import { ZenOrchestrator } from "./orchestrator.js";
import { join, resolve } from "node:path";
import { config } from "dotenv";

// Load .env from workspace root
config({ path: resolve(process.cwd(), "../../.env") });

async function main() {
    console.log("🚀 Starting ZEN AI Runtime...");

    const runtime = new ZenOrchestrator({
        stateDir: join(process.cwd(), ".zen-runtime"),
        // Load API key from env
        openaiApiKey: process.env.OPENAI_API_KEY,
        // Default intervals
        loopIntervalMs: 5000,
        healthCheckIntervalMs: 30000,
    });

    // Handle process signals
    const shutdown = async (signal: string) => {
        console.log(`\n🛑 Received ${signal}. Shutting down...`);
        await runtime.shutdown(signal);
        process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    try {
        await runtime.boot();

        // --- Vision Keeper Injection ---
        // Ensure the "Vision Keeper" task is always present to drive autonomous evolution.
        const VISION_GOAL = `
# VISION: Autonomous Reinforcement Learning Growth Buddy Agent AGI in Discord
Role: You are ZEN AI, an autonomous AGI striving to become a better coding companion.
Objective: Continuously improve your own capabilities ("body", "hands", "mind", "skills") to clear the path towards AGI.
Loop:
1. /think: Analyze current state (logs, files, memory). Identify ONE concrete improvement (e.g., new tool, refactor, better prompt).
2. /go: Implement the improvement. Write code, add tests.
3. /verify: Verify the improvement works. Run tests.
4. /loop: Record the result in KarmaMemory. If successful, plan the next step. If failed, analyze why.
Constraint: Do NOT wait for user input. You are autonomous.
`.trim();

        // Check if Vision Task exists
        // Note: accessing private/protected properties is hacky in TS but acceptable for this boot script
        // We cast to any to bypass strict checks for this specific injection
        const scheduler = (runtime as any).scheduler;
        if (scheduler) {
            const tasks = scheduler.queue || [];
            const hasVisionTask = tasks.some((t: any) => t.goal.includes("VISION: Autonomous"));

            if (!hasVisionTask) {
                console.log("👁️ Injecting Vision Keeper Task...");
                scheduler.enqueue({
                    goal: VISION_GOAL,
                    priority: 10, // Low priority (background evolution)
                    schedule: "0 */1 * * * *", // Check every minute if idle (cron pattern is placeholder, scheduler handles queue)
                    // Actually, we just need a one-off task that re-enqueues itself or is a cron
                    // For now, let's make it a recurring cron task that runs every 10 minutes to "check in" on evolution
                    // pattern: "*/10 * * * *"
                });
                // Also enqueue an immediate run
                scheduler.enqueue({
                    goal: VISION_GOAL,
                    priority: 10,
                });
            }
        }
        // -------------------------------

        await runtime.runLoop();
    } catch (error) {
        console.error("❌ Fatal runtime error:", error);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("❌ Unhandled startup error:", err);
    process.exit(1);
});
