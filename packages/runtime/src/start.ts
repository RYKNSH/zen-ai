// ============================================================================
// ZEN AI Runtime — Entry Point
// Starts the autonomous orchestrator.
//Usage: node dist/start.js
// ============================================================================

import { ZenOrchestrator } from "./orchestrator.js";
import { join } from "node:path";

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
