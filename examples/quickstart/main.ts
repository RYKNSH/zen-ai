// ============================================================================
// ZEN AI — Quickstart Example
// "Don't accumulate. Perceive now."
//
// This example creates a simple agent that uses GPT-4o to analyze
// a text file and summarize its contents.
//
// Usage:
//   1. Set OPENAI_API_KEY environment variable
//   2. Run: npx tsx main.ts
// ============================================================================

import { ZenAgent } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import { fileReadTool, fileWriteTool } from "@zen-ai/tools";

// Create the agent
const agent = new ZenAgent({
    goal: "Read the file 'sample.txt' and create a summary in 'summary.txt'",

    llm: new OpenAIAdapter({
        model: "gpt-4o",
        // API key from OPENAI_API_KEY env var
    }),

    milestones: [
        {
            id: "read",
            description: "Read the source file",
            resources: ["sample.txt"],
        },
        {
            id: "write",
            description: "Write the summary",
            resources: ["summary.txt"],
        },
    ],

    tools: [fileReadTool, fileWriteTool],
    maxSteps: 10,
});

// Listen for events
agent.on("agent:start", ({ goal }) => {
    console.log(`\n🧘 ZEN AI Agent Starting`);
    console.log(`   Goal: ${goal.description}\n`);
});

agent.on("milestone:reached", ({ milestoneId }) => {
    console.log(`   ✅ Milestone "${milestoneId}" reached!`);
});

agent.on("action:complete", ({ action, result, step }) => {
    const icon = result.success ? "✅" : "❌";
    console.log(`   Step ${step}: ${action.toolName} ${icon}`);
});

agent.on("agent:complete", () => {
    console.log(`\n🧘 Agent complete.\n`);
});

// Run!
await agent.run();
