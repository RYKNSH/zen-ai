#!/usr/bin/env node
// ============================================================================
// ZEN AI CLI — "Don't accumulate. Perceive now."
//
// Commands:
//   zen init              Initialize a new ZEN AI project
//   zen run [config]      Run the agent with a config file
//   zen status [dir]      Show agent status from state file
// ============================================================================

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

const VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// CLI Entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case "init":
        await cmdInit(args.slice(1));
        break;
    case "run":
        await cmdRun(args.slice(1));
        break;
    case "status":
        await cmdStatus(args.slice(1));
        break;
    case "--version":
    case "-v":
        console.log(`zen-ai v${VERSION}`);
        break;
    case "--help":
    case "-h":
    case undefined:
        printHelp();
        break;
    default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdInit(_args: string[]) {
    const projectDir = _args[0] ?? ".";
    const dir = resolve(projectDir);

    console.log(`🧘 Initializing ZEN AI project in ${dir}...`);

    // Create directories
    await mkdir(join(dir, "skills"), { recursive: true });
    await mkdir(join(dir, "failures"), { recursive: true });

    // Create zen.config.ts template
    const configContent = `// ZEN AI Configuration
// See: https://github.com/zen-ai/zen-ai

import { ZenAgent } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import { SkillDB, FailureKnowledgeDB } from "@zen-ai/memory";
import { fileReadTool, fileWriteTool, httpTool } from "@zen-ai/tools";

const agent = new ZenAgent({
  goal: "Describe your agent's goal here",

  llm: new OpenAIAdapter({
    model: "gpt-4o",
  }),

  milestones: [
    { id: "m1", description: "First milestone", resources: [] },
  ],

  tools: [fileReadTool, fileWriteTool, httpTool],

  skillDB: new SkillDB({ persistPath: "./skills/skills.json" }),
  failureDB: new FailureKnowledgeDB({ persistPath: "./failures/failures.json" }),

  snapshot: async () => ({
    timestamp: new Date().toISOString(),
  }),
});

agent.on("milestone:reached", ({ milestoneId }) => {
  console.log(\`✅ Milestone \${milestoneId} reached!\`);
});

agent.on("action:complete", ({ action, result, step }) => {
  console.log(\`  Step \${step}: \${action.toolName} → \${result.success ? "✅" : "❌"}\`);
});

await agent.run();
console.log("🧘 Agent complete.");
`;

    const configPath = join(dir, "zen.config.ts");
    if (!existsSync(configPath)) {
        await writeFile(configPath, configContent, "utf-8");
        console.log("  ✅ Created zen.config.ts");
    } else {
        console.log("  ⏭  zen.config.ts already exists, skipping");
    }

    // Create .env template
    const envPath = join(dir, ".env.example");
    if (!existsSync(envPath)) {
        await writeFile(
            envPath,
            "OPENAI_API_KEY=your-api-key-here\n",
            "utf-8",
        );
        console.log("  ✅ Created .env.example");
    }

    console.log("\n🧘 Done! Edit zen.config.ts and run: zen run");
}

async function cmdRun(_args: string[]) {
    const configFile = _args[0] ?? "zen.config.ts";
    const configPath = resolve(configFile);

    if (!existsSync(configPath)) {
        console.error(`❌ Config file not found: ${configPath}`);
        console.error("   Run 'zen init' first to create a template.");
        process.exit(1);
    }

    console.log(`🧘 Running agent from ${configFile}...`);
    console.log("   (Importing config and executing agent.run())\n");

    try {
        // Dynamic import of the config file
        // Note: For .ts files, the user needs tsx or ts-node
        await import(configPath);
    } catch (error) {
        console.error("❌ Failed to run agent:", error);
        process.exit(1);
    }
}

async function cmdStatus(_args: string[]) {
    const dir = resolve(_args[0] ?? ".");
    const statePath = join(dir, ".zen-state.json");

    if (!existsSync(statePath)) {
        console.log("🧘 No agent state found. Run 'zen run' first.");
        return;
    }

    try {
        const data = await readFile(statePath, "utf-8");
        const state = JSON.parse(data);

        console.log("🧘 ZEN AI Agent Status");
        console.log("═══════════════════════════════════════");
        console.log(`  Goal:       ${state.goal?.description ?? "Unknown"}`);
        console.log(`  Milestone:  ${state.currentMilestoneIndex ?? 0}`);
        console.log(`  Steps:      ${state.stepCount ?? 0}`);
        console.log(`  Progress:   ${state.delta?.progress ? `${(state.delta.progress * 100).toFixed(0)}%` : "N/A"}`);
        console.log(`  Last Update: ${state.lastUpdatedAt ?? "N/A"}`);

        if (state.delta?.gaps?.length) {
            console.log(`  Gaps:`);
            for (const gap of state.delta.gaps) {
                console.log(`    - ${gap}`);
            }
        }

        if (state.failures?.length) {
            console.log(`  Failures:   ${state.failures.length} recorded`);
        }
    } catch (error) {
        console.error("❌ Failed to read state:", error);
    }
}

function printHelp() {
    console.log(`
🧘 ZEN AI CLI v${VERSION}
   "Don't accumulate. Perceive now."

Usage:
  zen init [dir]          Initialize a new ZEN AI project
  zen run [config]        Run agent (default: zen.config.ts)
  zen status [dir]        Show agent status

Options:
  -v, --version           Show version
  -h, --help              Show this help

Examples:
  zen init my-agent       Create a new agent project
  zen run                 Run with default config
  zen status              Check current agent state
`);
}
