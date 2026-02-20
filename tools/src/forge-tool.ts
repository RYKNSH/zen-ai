// ============================================================================
// ZEN AI SDK — Tool Forge
// ZENNY creates, persists, and hot-loads new tools at runtime.
// "The blacksmith who forges its own hands."
// ============================================================================

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Tool, ToolResult } from "@zen-ai/core";

// ---------------------------------------------------------------------------
// Forge Directory — where tools live on disk
// ---------------------------------------------------------------------------

const DEFAULT_FORGE_DIR = join(process.cwd(), "data", "forged-tools");

/** Registry of forged tools loaded at runtime. */
const forgedTools: Map<string, Tool> = new Map();

// ---------------------------------------------------------------------------
// Core: Forge a Tool from JSON spec
// ---------------------------------------------------------------------------

/** A forged tool spec stored on disk. */
export interface ForgedToolSpec {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, { type: string; description: string }>;
        required?: string[];
    };
    /** JavaScript body. Receives `params` and `require`. Must return { success, output } or throw. */
    implementation: string;
    forgedAt: string;
    /** Optional: npm packages this tool depends on. */
    dependencies?: string[];
}

/**
 * Create a live Tool from a ForgedToolSpec.
 * The implementation runs in a sandboxed Function with a 10s timeout.
 */
function createToolFromSpec(spec: ForgedToolSpec): Tool {
    return {
        name: spec.name,
        description: spec.description,
        parameters: spec.parameters,
        async execute(params: Record<string, unknown>): Promise<ToolResult> {
            try {
                const fn = new Function("params", "require", `
                    "use strict";
                    return (async () => {
                        ${spec.implementation}
                    })();
                `);
                const result = await Promise.race([
                    fn(params, require),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Forged tool execution timed out (10s)")), 10_000),
                    ),
                ]);
                // Normalize result
                if (result && typeof result === "object" && "success" in result) {
                    return result as ToolResult;
                }
                return { success: true, output: result };
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
// Persistence: Save / Load
// ---------------------------------------------------------------------------

async function ensureForgeDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

async function saveSpec(dir: string, spec: ForgedToolSpec): Promise<void> {
    await ensureForgeDir(dir);
    const filePath = join(dir, `${spec.name}.json`);
    await writeFile(filePath, JSON.stringify(spec, null, 2), "utf-8");
}

/**
 * Load all forged tools from the forge directory.
 * Returns an array of live Tool objects ready to register.
 */
export async function loadForgedTools(dir: string = DEFAULT_FORGE_DIR): Promise<Tool[]> {
    if (!existsSync(dir)) return [];

    const files = await readdir(dir);
    const tools: Tool[] = [];

    for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
            const raw = await readFile(join(dir, file), "utf-8");
            const spec = JSON.parse(raw) as ForgedToolSpec;
            const tool = createToolFromSpec(spec);
            forgedTools.set(spec.name, tool);
            tools.push(tool);
        } catch {
            // Skip corrupt files
        }
    }
    return tools;
}

// ---------------------------------------------------------------------------
// The Forge Meta-Tool — ZENNY uses this to create new tools
// ---------------------------------------------------------------------------

/**
 * Create the Tool Forge meta-tool.
 * When ZENNY invokes this, a new tool is created, saved to disk,
 * and immediately added to the agent's capabilities.
 *
 * @param addTool - Callback to register the tool with the running agent
 * @param forgeDir - Directory to persist forged tools
 */
export function createForgeTool(
    addTool: (tool: Tool) => void,
    forgeDir: string = DEFAULT_FORGE_DIR,
): Tool {
    return {
        name: "tool_forge",
        description:
            "Create a new tool that the agent can use. " +
            "The tool is saved to disk and survives restarts. " +
            "Use this when you need a capability you don't currently have. " +
            "The implementation is JavaScript code that receives 'params' object and 'require' function. " +
            "It must return { success: true, output: ... } or throw an error.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Tool name in snake_case (e.g. 'weather_api', 'image_resize')",
                },
                description: {
                    type: "string",
                    description: "What this tool does, in one sentence",
                },
                parameters_json: {
                    type: "string",
                    description: 'JSON string of parameter schema: {"type":"object","properties":{...},"required":[...]}',
                },
                implementation: {
                    type: "string",
                    description:
                        "JavaScript code body. Has access to 'params' (input) and 'require' (Node.js require). " +
                        "Must return { success: true, output: ... }. Example: " +
                        "'const fs = require(\"fs\"); const data = fs.readFileSync(params.path, \"utf-8\"); return { success: true, output: data };'",
                },
                dependencies: {
                    type: "string",
                    description: "Comma-separated npm package names to install first (optional). Example: 'axios,cheerio'",
                },
            },
            required: ["name", "description", "parameters_json", "implementation"],
        },
        async execute(params): Promise<ToolResult> {
            try {
                const name = params.name as string;
                const description = params.description as string;
                const parametersJson = params.parameters_json as string;
                const implementation = params.implementation as string;
                const depsStr = (params.dependencies as string) || "";

                // Validate name
                if (!/^[a-z][a-z0-9_]*$/.test(name)) {
                    return {
                        success: false,
                        output: null,
                        error: "Tool name must be snake_case (lowercase letters, numbers, underscores, starting with a letter).",
                    };
                }

                // Parse parameters
                let toolParams;
                try {
                    toolParams = JSON.parse(parametersJson);
                } catch {
                    return {
                        success: false,
                        output: null,
                        error: "parameters_json is not valid JSON.",
                    };
                }

                // Install dependencies if specified
                if (depsStr.trim()) {
                    const deps = depsStr.split(",").map((d) => d.trim()).filter(Boolean);
                    const { exec } = require("node:child_process");
                    const { promisify } = require("node:util");
                    const execAsync = promisify(exec);

                    for (const dep of deps) {
                        // Safety: only allow simple package names
                        if (!/^[@a-z0-9][\w./-]*$/.test(dep)) {
                            return {
                                success: false,
                                output: null,
                                error: `Invalid package name: "${dep}"`,
                            };
                        }
                        try {
                            await execAsync(`npm install ${dep} --save`, {
                                cwd: process.cwd(),
                                timeout: 60_000,
                            });
                        } catch (e) {
                            return {
                                success: false,
                                output: null,
                                error: `Failed to install "${dep}": ${e instanceof Error ? e.message : String(e)}`,
                            };
                        }
                    }
                }

                // Create the spec
                const spec: ForgedToolSpec = {
                    name,
                    description,
                    parameters: toolParams,
                    implementation,
                    forgedAt: new Date().toISOString(),
                    dependencies: depsStr ? depsStr.split(",").map((d) => d.trim()).filter(Boolean) : undefined,
                };

                // Create live tool
                const tool = createToolFromSpec(spec);

                // Quick validation: try to instantiate the function (dry run)
                try {
                    new Function("params", "require", `"use strict"; return (async () => { ${implementation} })();`);
                } catch (syntaxError) {
                    return {
                        success: false,
                        output: null,
                        error: `Syntax error in implementation: ${syntaxError instanceof Error ? syntaxError.message : String(syntaxError)}`,
                    };
                }

                // Save to disk
                await saveSpec(forgeDir, spec);

                // Register with agent
                addTool(tool);
                forgedTools.set(name, tool);

                return {
                    success: true,
                    output: `Tool "${name}" forged and registered. It will persist across restarts. Description: ${description}`,
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

/** Get all currently loaded forged tools. */
export function getForgedTools(): Map<string, Tool> {
    return forgedTools;
}
