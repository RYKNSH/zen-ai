#!/usr/bin/env node
// ============================================================================
// ZEN AI Discord Bot — Deploy Commands
// Register slash commands with Discord.
//
// Usage:
//   DISCORD_BOT_TOKEN=... DISCORD_CLIENT_ID=... node dist/deploy-commands.js
// ============================================================================

import { ZenDiscordBot } from "./bot.js";

const bot = new ZenDiscordBot();

try {
    await bot.deployCommands();
    console.log("✅ Commands deployed successfully.");
    process.exit(0);
} catch (error) {
    console.error(
        "❌ Failed to deploy commands:",
        error instanceof Error ? error.message : error,
    );
    process.exit(1);
}
