import { ZenAgent } from "@zen-ai/core";
import { OpenAIAdapter } from "@zen-ai/adapter-openai";
import dotenv from "dotenv";
import path from "path";

// Load env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

async function main() {
    console.log("🧪 Starting Cost Reporter Test...");

    const adapter = new OpenAIAdapter();
    const agent = new ZenAgent({
        llm: adapter,
        goal: {
            description: "What is 2 + 2? Answer simply.",
        },
        maxSteps: 1, // Force finish quickly
    });

    agent.on("agent:complete", ({ cost, usage }) => {
        console.log("\n✅ Agent Complete Event Received!");
        console.log(`💰 Cost: $${cost.toFixed(6)}`);
        console.log(`📊 Usage:`, usage);
    });

    try {
        await agent.run();
    } catch (error) {
        console.error("❌ Agent failed:", error);
    }
}

main().catch(console.error);
