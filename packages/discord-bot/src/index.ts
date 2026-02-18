#!/usr/bin/env node
// ============================================================================
// ZEN AI Discord Bot — Entry Point
//
// Usage:
//   DISCORD_BOT_TOKEN=... OPENAI_API_KEY=... node dist/index.js
// ============================================================================

import { ZenDiscordBot } from "./bot.js";

const bot = new ZenDiscordBot({
    maxStepsPerRun: 30,
    skillDBPath: "./memory/skills.json",
    failureDBPath: "./memory/failures.json",
});

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("\n🧘 Shutting down...");
    await bot.stop();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await bot.stop();
    process.exit(0);
});

// Start
await bot.start();
