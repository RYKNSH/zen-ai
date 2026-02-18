// ============================================================================
// ZEN AI — File Agent Example
//
// An autonomous agent that organizes files in a directory.
// Demonstrates:
//   - Multi-milestone workflow
//   - SkillDB for learning patterns
//   - FailureKnowledgeDB for remembering mistakes
//   - Context Reset between milestones
//
// Usage:
//   1. Set OPENAI_API_KEY
//   2. Create some files in ./workspace/
//   3. Run: npx tsx main.ts
// ============================================================================

import { ZenAgent } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import { SkillDB, FailureKnowledgeDB } from "@zen-ai/memory";
import { fileReadTool, fileWriteTool, createShellTool } from "@zen-ai/tools";
import { readdir, stat, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const WORKSPACE = resolve("./workspace");

// Ensure workspace exists
await mkdir(WORKSPACE, { recursive: true });

// Create LLM
const llm = new OpenAIAdapter({
    model: "gpt-4o",
    temperature: 0.3, // Low temp for reliable file operations
});

// Create memory stores
const skillDB = new SkillDB({
    persistPath: "./memory/skills.json",
    llm,
});

const failureDB = new FailureKnowledgeDB({
    persistPath: "./memory/failures.json",
    llm,
});

// Load existing knowledge
await skillDB.load();
await failureDB.load();

// Snapshot function — captures the current state of the workspace
async function captureSnapshot(): Promise<Record<string, unknown>> {
    const files: string[] = [];

    async function walk(dir: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else {
                const stats = await stat(fullPath);
                files.push(
                    `${fullPath} (${stats.size}B, ${entry.name.split(".").pop()})`,
                );
            }
        }
    }

    await walk(WORKSPACE);

    return {
        timestamp: new Date().toISOString(),
        workspaceDir: WORKSPACE,
        fileCount: files.length,
        files,
    };
}

// Create the agent
const agent = new ZenAgent({
    goal: {
        description: `Organize all files in ${WORKSPACE} into subdirectories by file type.
    Rules:
    - Create directories: images/, documents/, code/, data/, other/
    - Move each file to its appropriate directory based on extension
    - Create a manifest.json listing all organized files
    - Do NOT move or modify directories themselves`,
    },

    llm,

    milestones: [
        {
            id: "scan",
            description: "Scan and catalog all files in the workspace",
            resources: [],
        },
        {
            id: "organize",
            description: "Create directories and move files",
            resources: ["images", "documents", "code", "data", "other"],
        },
        {
            id: "manifest",
            description: "Create manifest.json with organized file listing",
            resources: ["manifest.json"],
        },
    ],

    tools: [
        fileReadTool,
        fileWriteTool,
        createShellTool({ unsafe: true }), // Enable shell for file moving
    ],

    snapshot: captureSnapshot,
    skillDB,
    failureDB,
    maxSteps: 30,
});

// Event handlers
agent.on("agent:start", ({ goal }) => {
    console.log(`\n🧘 ZEN AI File Agent`);
    console.log(`   Goal: ${goal.description.split("\n")[0]}`);
    console.log(`   Workspace: ${WORKSPACE}\n`);
});

agent.on("milestone:reached", ({ milestoneId }) => {
    console.log(`\n   ✅ Milestone "${milestoneId}" reached!`);
    console.log(`   📦 Context Reset — fresh mind for next phase.\n`);
});

agent.on("action:complete", ({ action, result, step }) => {
    const icon = result.success ? "✅" : "❌";
    console.log(
        `   Step ${step}: ${action.toolName}(${JSON.stringify(action.parameters).slice(0, 60)}...) ${icon}`,
    );
});

agent.on("context:reset", ({ milestoneId, failures }) => {
    if (failures.length > 0) {
        console.log(
            `   💀 ${failures.length} failure(s) preserved as proverbs.`,
        );
    }
});

agent.on("agent:complete", ({ goal }) => {
    console.log(`\n🧘 File Agent Complete.`);
    console.log(`   ${goal.description.split("\n")[0]}\n`);
});

// Run the agent
console.log("Starting file agent...");
await agent.run();
