// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-virya (精進 / Autonomous Tool Synthesis)
// "The third perfection: diligent effort creates capability."
// ============================================================================
//
// Virya (वीर्य) — the Tool Synthesis Plugin for ZEN AI.
//
// This plugin implements the third of the Six Perfections (六波羅蜜多).
// When the agent encounters a gap that no existing tool can fill, Virya
// uses the LLM to synthesize a new tool on-the-fly, register it, and
// make it available for the current and future runs.
//
// Hooks used:
//   - afterDelta: Detect tool gaps and trigger synthesis
//   - beforeDecide: Inject synthesized tool descriptions
//   - onError: Synthesize recovery tools from error patterns
// ============================================================================

import type {
    ZenPlugin,
    ZenPluginHooks,
    PluginContext,
    Tool,
    ToolResult,
    ToolBlueprint,
    Delta,
    LLMAdapter,
} from "@zen-ai/core";

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Security denylist for synthesized tool implementations
const DENYLIST_PATTERNS = [
    /\bprocess\b/,
    /\brequire\b/,
    /\bimport\b/,
    /\beval\b/,
    /\bFunction\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\bglobalThis\b/,
    /\b__dirname\b/,
    /\b__filename\b/,
    /\bchild_process\b/,
    /\bexecSync\b/,
    /\bspawnSync\b/,
];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the Virya plugin. */
export interface ViryaConfig {
    /** LLM adapter for tool synthesis. */
    llm: LLMAdapter;
    /** Agent instance (for dynamic tool registration via addTool). */
    agent: { addTool(tool: Tool): void; getToolNames(): string[] };
    /** Directory to persist synthesized tool blueprints. */
    blueprintDir?: string;
    /** Maximum tools to synthesize per run. Default: 3. */
    maxSynthesesPerRun?: number;
    /** Minimum confidence threshold for synthesized tools. Default: 0.7. */
    minConfidence?: number;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Metrics tracked by the Virya plugin. */
export interface ViryaMetrics {
    /** Total synthesis attempts. */
    attempts: number;
    /** Successful syntheses. */
    successes: number;
    /** Failed syntheses. */
    failures: number;
    /** Names of synthesized tools. */
    synthesizedTools: string[];
}

// ---------------------------------------------------------------------------
// Sandboxed Tool Executor
// ---------------------------------------------------------------------------

/**
 * Create a sandboxed tool from a blueprint.
 * The implementation is evaluated in a restricted scope with JSON I/O.
 */
function createToolFromBlueprint(blueprint: ToolBlueprint): Tool {
    // Security check: reject implementations containing dangerous patterns
    for (const pattern of DENYLIST_PATTERNS) {
        if (pattern.test(blueprint.implementation)) {
            throw new Error(
                `Synthesized tool "${blueprint.name}" rejected: implementation contains forbidden pattern ${pattern}`,
            );
        }
    }

    return {
        name: blueprint.name,
        description: blueprint.description,
        parameters: blueprint.parameters,
        async execute(params: Record<string, unknown>): Promise<ToolResult> {
            try {
                // Create a sandboxed function from the implementation string
                // The function receives params and must return { success, output }
                const fn = new Function(
                    "params",
                    `"use strict";
                    return (async () => {
                        ${blueprint.implementation}
                    })();`,
                );
                // Timeout protection: 5 second limit
                const result = await Promise.race([
                    fn(params),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Tool execution timed out (5s)")), 5000),
                    ),
                ]);
                return {
                    success: true,
                    output: result ?? "Tool executed successfully",
                };
            } catch (error) {
                return {
                    success: false,
                    output: null,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Blueprint Persistence
// ---------------------------------------------------------------------------

function saveBlueprintToDisk(dir: string, blueprint: ToolBlueprint): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const filepath = join(dir, `${blueprint.name}.json`);
    writeFileSync(filepath, JSON.stringify(blueprint, null, 2), "utf-8");
}

function loadBlueprintsFromDisk(dir: string): ToolBlueprint[] {
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const blueprints: ToolBlueprint[] = [];
    for (const file of files) {
        try {
            const content = readFileSync(join(dir, file), "utf-8");
            blueprints.push(JSON.parse(content) as ToolBlueprint);
        } catch {
            // Skip malformed blueprints
        }
    }
    return blueprints;
}

// ---------------------------------------------------------------------------
// LLM-based Synthesis
// ---------------------------------------------------------------------------

async function synthesizeTool(
    llm: LLMAdapter,
    gap: string,
    existingTools: string[],
): Promise<ToolBlueprint | null> {
    const prompt = `You are a tool synthesis engine for an autonomous AI agent.

The agent has encountered a gap that no existing tool can fill:
"${gap}"

Existing tools: ${existingTools.join(", ")}

Design a new tool to fill this gap. Respond with ONLY valid JSON:
{
    "name": "tool_name_snake_case",
    "description": "What the tool does",
    "parameters": {
        "type": "object",
        "properties": {
            "param1": { "type": "string", "description": "..." }
        },
        "required": ["param1"]
    },
    "implementation": "// JS code that uses 'params' object and returns a result value\\nconst result = params.param1.toUpperCase();\\nreturn result;",
    "confidence": 0.8,
    "reason": "Why this tool is needed"
}

Rules:
- The implementation MUST be pure JavaScript (no imports, no require)
- The implementation receives a 'params' object and should return a value
- Keep implementations simple and deterministic
- Do NOT synthesize tools that duplicate existing capabilities`;

    try {
        const response = await llm.complete([
            { role: "system", content: "You are a tool synthesis engine. Respond with ONLY valid JSON." },
            { role: "user", content: prompt },
        ], { temperature: 0.3 });

        const text = response.content.trim();
        // Extract JSON from potential markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
        const json = jsonMatch[1]?.trim() ?? text;

        const blueprint = JSON.parse(json) as ToolBlueprint;

        // Validate required fields
        if (!blueprint.name || !blueprint.description || !blueprint.implementation) {
            return null;
        }

        return blueprint;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create a Virya (Tool Synthesis) plugin.
 *
 * Usage:
 * ```ts
 * const agent = new ZenAgent({ ... });
 * await agent.use(createViryaPlugin({
 *     llm: myLLMAdapter,
 *     agent: agent,
 *     blueprintDir: "./data/blueprints",
 * }));
 * ```
 */
export function createViryaPlugin(config: ViryaConfig): ZenPlugin {
    const {
        llm,
        agent,
        blueprintDir,
        maxSynthesesPerRun = 3,
        minConfidence = 0.7,
    } = config;

    let metrics: ViryaMetrics = {
        attempts: 0,
        successes: 0,
        failures: 0,
        synthesizedTools: [],
    };

    let synthesesThisRun = 0;

    const hooks: ZenPluginHooks = {
        /**
         * beforeObserve: Reset per-run counters at the start of each step.
         * This ensures synthesesThisRun resets properly across multiple run() calls.
         */
        async beforeObserve(ctx: PluginContext) {
            if (ctx.stepCount === 0) {
                synthesesThisRun = 0;
            }
        },

        /**
         * afterDelta: If gaps mention missing capabilities, attempt synthesis.
         */
        async afterDelta(ctx: PluginContext, delta: Delta) {
            if (synthesesThisRun >= maxSynthesesPerRun) return;

            // Look for gaps that suggest a tool is needed
            const toolGapKeywords = ["cannot", "no tool", "missing", "unable", "need a way"];
            const hasToolGap = delta.gaps.some((g) =>
                toolGapKeywords.some((kw) => g.toLowerCase().includes(kw)),
            );

            if (!hasToolGap) return;

            const gapDescription = delta.gaps.join("; ");
            const existingTools = agent.getToolNames();

            metrics.attempts++;
            const blueprint = await synthesizeTool(llm, gapDescription, existingTools);

            if (!blueprint || blueprint.confidence < minConfidence) {
                metrics.failures++;
                return;
            }

            // Check for name collisions
            if (existingTools.includes(blueprint.name)) {
                return; // Don't override existing tools
            }

            try {
                const tool = createToolFromBlueprint(blueprint);
                agent.addTool(tool);
                metrics.successes++;
                metrics.synthesizedTools.push(blueprint.name);
                synthesesThisRun++;

                // Persist blueprint
                if (blueprintDir) {
                    saveBlueprintToDisk(blueprintDir, blueprint);
                }
            } catch {
                metrics.failures++;
            }
        },

        /**
         * beforeDecide: Inject info about synthesized tools.
         */
        async beforeDecide(ctx: PluginContext): Promise<string[]> {
            if (metrics.synthesizedTools.length === 0) return [];

            return [
                `## ⚡ Synthesized Tools (Virya)\n${metrics.synthesizedTools.map((t) => `- ${t} (dynamically created)`).join("\n")}`,
            ];
        },

        /**
         * onError: Try to synthesize a recovery tool from error patterns.
         */
        async onError(ctx: PluginContext, error: Error) {
            if (synthesesThisRun >= maxSynthesesPerRun) return;

            const errorGap = `Error recovery needed: ${error.message}`;
            const existingTools = agent.getToolNames();

            metrics.attempts++;
            const blueprint = await synthesizeTool(llm, errorGap, existingTools);

            if (!blueprint || blueprint.confidence < minConfidence) {
                metrics.failures++;
                return;
            }

            if (existingTools.includes(blueprint.name)) return;

            try {
                const tool = createToolFromBlueprint(blueprint);
                agent.addTool(tool);
                metrics.successes++;
                metrics.synthesizedTools.push(blueprint.name);
                synthesesThisRun++;

                if (blueprintDir) {
                    saveBlueprintToDisk(blueprintDir, blueprint);
                }
            } catch {
                metrics.failures++;
            }
        },
    };

    return {
        name: "virya",
        description: "Autonomous Tool Synthesis — the third perfection (精進). Creates tools on-the-fly when gaps are detected.",
        hooks,
        install() {
            metrics = {
                attempts: 0,
                successes: 0,
                failures: 0,
                synthesizedTools: [],
            };
            synthesesThisRun = 0;

            // Load previously synthesized blueprints
            if (blueprintDir) {
                const blueprints = loadBlueprintsFromDisk(blueprintDir);
                for (const bp of blueprints) {
                    if (!agent.getToolNames().includes(bp.name)) {
                        try {
                            const tool = createToolFromBlueprint(bp);
                            agent.addTool(tool);
                            metrics.synthesizedTools.push(bp.name);
                        } catch {
                            // Skip broken blueprints
                        }
                    }
                }
            }
        },
    };
}
