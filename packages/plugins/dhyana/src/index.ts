// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-dhyana (禅定 / Self-Evolution Engine)
// "The sixth perfection: deep contemplation reveals what is needed,
//  then acquires it from the world."
// ============================================================================
//
// Dhyana (ध्यान) — the Self-Evolution Plugin for ZEN AI.
//
// Unlike Virya (精進) which synthesizes pure-JS tools internally,
// Dhyana reaches out to the external world:
//   - Detects capability gaps from failures
//   - Researches npm/web for relevant packages
//   - Evaluates safety (downloads, license, freshness)
//   - Installs via shell
//   - Wraps as ZenAgent-compatible tools
//   - Validates and registers in SkillDB
//
// Hooks used:
//   - afterAction: Detect gaps from failed tool executions
//   - onError: Detect gaps from agent-level errors
//   - onEvolution: Trigger proactive capability search
// ============================================================================

import type {
    ZenPlugin,
    ZenPluginHooks,
    PluginContext,
    Tool,
    ToolResult,
    Action,
    LLMAdapter,
    SelfEvolutionRecord,
} from "@zen-ai/core";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const SHELL_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the Dhyana plugin. */
export interface DhyanaConfig {
    /** LLM adapter for analysis and code generation. */
    llm: LLMAdapter;
    /** Agent instance for dynamic tool registration. */
    agent: { addTool(tool: Tool): void; getToolNames(): string[] };
    /** Working directory for npm operations (must have package.json). */
    workDir: string;
    /** Directory to persist acquired tool wrappers. */
    acquisitionDir?: string;
    /** Maximum acquisitions per run. Default: 2. */
    maxAcquisitionsPerRun?: number;
    /** Minimum weekly downloads for safety gate. Default: 1000. */
    minWeeklyDownloads?: number;
    /** Allowed licenses. Default: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause. */
    allowedLicenses?: string[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an npm search. */
interface NpmPackageInfo {
    name: string;
    description: string;
    version: string;
    date: string;
    links?: { npm?: string; homepage?: string };
}

/** Evaluated package candidate. */
interface PackageCandidate {
    name: string;
    description: string;
    weeklyDownloads: number;
    lastPublish: string;
    license: string;
    relevance: number;
    safe: boolean;
    reason?: string;
}

/** An acquired tool wrapper stored on disk. */
interface AcquiredTool {
    packageName: string;
    toolName: string;
    description: string;
    wrapperCode: string;
    acquiredAt: string;
    validated: boolean;
}

/** Metrics tracked by Dhyana. */
export interface DhyanaMetrics {
    gapsDetected: number;
    researchAttempts: number;
    packagesEvaluated: number;
    packagesInstalled: number;
    toolsCreated: number;
    toolsFailed: number;
    acquiredToolNames: string[];
}

// ---------------------------------------------------------------------------
// Safety Gate
// ---------------------------------------------------------------------------

const DEFAULT_ALLOWED_LICENSES = [
    "MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD",
];

function isSafePackage(
    candidate: PackageCandidate,
    minDownloads: number,
    allowedLicenses: string[],
): { safe: boolean; reason?: string } {
    if (candidate.weeklyDownloads < minDownloads) {
        return { safe: false, reason: `Low downloads: ${candidate.weeklyDownloads} < ${minDownloads}` };
    }

    // Check publish freshness (within 1 year)
    const lastPublishDate = new Date(candidate.lastPublish);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (lastPublishDate < oneYearAgo) {
        return { safe: false, reason: `Stale: last published ${candidate.lastPublish}` };
    }

    if (!allowedLicenses.includes(candidate.license)) {
        return { safe: false, reason: `License "${candidate.license}" not allowed` };
    }

    return { safe: true };
}

// ---------------------------------------------------------------------------
// Pipeline Stages
// ---------------------------------------------------------------------------

/** Stage 1: Detect capability gap from error context. */
async function detectGap(
    llm: LLMAdapter,
    context: string,
): Promise<string | null> {
    const prompt = `You are analyzing an AI agent's failure to determine if an external package/SDK/API could help.

Context: ${context}

Does this failure suggest a missing EXTERNAL capability (npm package, API, SDK)?
If yes, respond with ONLY a one-line description of what's needed, e.g.:
"Image manipulation library for resizing and cropping"
If no external package would help, respond with exactly: NO`;

    try {
        const response = await llm.chat([
            { role: "system", content: "Respond with one line only." },
            { role: "user", content: prompt },
        ]);

        const text = (response.content ?? "").trim();
        if (text.toUpperCase() === "NO" || text.length > 200) return null;
        return text;
    } catch {
        return null;
    }
}

/** Stage 2: Research npm for relevant packages. */
async function researchPackages(
    gap: string,
    workDir: string,
): Promise<NpmPackageInfo[]> {
    // Extract search keywords from gap description
    const keywords = gap.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").slice(0, 3).join("+");

    try {
        const { stdout } = await execAsync(
            `npm search ${keywords} --json 2>/dev/null | head -c 10000`,
            { cwd: workDir, timeout: SHELL_TIMEOUT },
        );
        const results = JSON.parse(stdout) as NpmPackageInfo[];
        return results.slice(0, 5); // Top 5 results
    } catch {
        return [];
    }
}

/** Stage 3: Evaluate packages via npm API for download counts and license. */
async function evaluatePackage(
    pkg: NpmPackageInfo,
    llm: LLMAdapter,
    gap: string,
    workDir: string,
): Promise<PackageCandidate> {
    let weeklyDownloads = 0;
    let license = "UNKNOWN";
    let lastPublish = new Date().toISOString();

    // Get package details from npm registry
    try {
        const { stdout: dlStdout } = await execAsync(
            `curl -s "https://api.npmjs.org/downloads/point/last-week/${pkg.name}" 2>/dev/null`,
            { cwd: workDir, timeout: 10_000 },
        );
        const dlData = JSON.parse(dlStdout);
        weeklyDownloads = dlData.downloads ?? 0;
    } catch { /* use default */ }

    try {
        const { stdout: infoStdout } = await execAsync(
            `npm view ${pkg.name} license time.modified --json 2>/dev/null`,
            { cwd: workDir, timeout: 10_000 },
        );
        const info = JSON.parse(infoStdout);
        license = typeof info === "object" && info.license ? info.license : "UNKNOWN";
        lastPublish = (typeof info === "object" && info["time.modified"]) || pkg.date || lastPublish;
    } catch { /* use defaults */ }

    // LLM relevance scoring
    let relevance = 0.5;
    try {
        const response = await llm.chat([
            { role: "system", content: "Rate relevance 0.0-1.0. Respond with ONLY a number." },
            { role: "user", content: `Gap: "${gap}"\nPackage: "${pkg.name}" — ${pkg.description}\nHow relevant is this package? Respond with only a decimal number.` },
        ]);
        const parsed = parseFloat((response.content ?? "0.5").trim());
        if (!isNaN(parsed)) relevance = Math.min(1, Math.max(0, parsed));
    } catch { /* use default */ }

    return {
        name: pkg.name,
        description: pkg.description,
        weeklyDownloads,
        lastPublish,
        license,
        relevance,
        safe: false, // filled by safety gate
    };
}

/** Stage 4: Install a package. */
async function installPackage(
    packageName: string,
    workDir: string,
): Promise<boolean> {
    try {
        await execAsync(`npm install ${packageName} --save 2>&1`, {
            cwd: workDir,
            timeout: 60_000,
        });
        return true;
    } catch {
        return false;
    }
}

/** Stage 5: Generate a Tool wrapper using LLM. */
async function generateToolWrapper(
    llm: LLMAdapter,
    packageName: string,
    description: string,
    gap: string,
): Promise<{ toolName: string; wrapperCode: string } | null> {
    const prompt = `Generate a ZEN AI Tool wrapper for the npm package "${packageName}".

Package description: ${description}
Agent's need: ${gap}

Create a wrapper that:
1. Requires the package: const pkg = require("${packageName}")
2. Exposes the MOST USEFUL single function as a Tool
3. Has clear parameters and error handling

Respond with ONLY valid JSON:
{
    "toolName": "snake_case_name",
    "description": "What this tool does",
    "parameters": {
        "type": "object",
        "properties": {
            "input": { "type": "string", "description": "..." }
        },
        "required": ["input"]
    },
    "implementation": "const pkg = require(\\"${packageName}\\"); const result = await pkg.someFunction(params.input); return { success: true, output: result };"
}`;

    try {
        const response = await llm.chat([
            { role: "system", content: "You generate tool wrapper code. Respond with ONLY valid JSON." },
            { role: "user", content: prompt },
        ]);

        const text = (response.content ?? "").trim();
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
        const json = jsonMatch[1]?.trim() ?? text;
        const parsed = JSON.parse(json);

        if (!parsed.toolName || !parsed.implementation) return null;

        return {
            toolName: parsed.toolName,
            wrapperCode: JSON.stringify(parsed, null, 2),
        };
    } catch {
        return null;
    }
}

/** Stage 6: Validate a wrapper by dry-running require(). */
async function validateWrapper(
    packageName: string,
    workDir: string,
): Promise<boolean> {
    try {
        const { stdout } = await execAsync(
            `node -e "try { require('${packageName}'); console.log('OK'); } catch(e) { console.log('FAIL: ' + e.message); }"`,
            { cwd: workDir, timeout: 10_000 },
        );
        return stdout.trim().startsWith("OK");
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function saveAcquiredTool(dir: string, tool: AcquiredTool): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${tool.toolName}.json`), JSON.stringify(tool, null, 2), "utf-8");
}

function loadAcquiredTools(dir: string): AcquiredTool[] {
    if (!existsSync(dir)) return [];
    try {
        const { readdirSync } = require("node:fs") as typeof import("node:fs");
        return readdirSync(dir)
            .filter((f: string) => f.endsWith(".json"))
            .map((f: string) => {
                try {
                    return JSON.parse(readFileSync(join(dir, f), "utf-8")) as AcquiredTool;
                } catch { return null; }
            })
            .filter((t): t is AcquiredTool => t !== null);
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Tool Creator — Creates runtime Tool from AcquiredTool
// ---------------------------------------------------------------------------

function createToolFromAcquired(acquired: AcquiredTool): Tool | null {
    try {
        const parsed = JSON.parse(acquired.wrapperCode);
        return {
            name: parsed.toolName ?? acquired.toolName,
            description: parsed.description ?? acquired.description,
            parameters: parsed.parameters ?? {
                type: "object",
                properties: { input: { type: "string", description: "Input" } },
                required: ["input"],
            },
            async execute(params: Record<string, unknown>): Promise<ToolResult> {
                try {
                    const fn = new Function("params", "require", `
                        "use strict";
                        return (async () => {
                            ${parsed.implementation}
                        })();
                    `);
                    const result = await Promise.race([
                        fn(params, require),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("Tool execution timed out")), 10_000),
                        ),
                    ]);
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
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create a Dhyana (Self-Evolution) plugin.
 *
 * Usage:
 * ```ts
 * const agent = new ZenAgent({ ... });
 * await agent.use(createDhyanaPlugin({
 *     llm: myLLMAdapter,
 *     agent: agent,
 *     workDir: process.cwd(),
 *     acquisitionDir: ".zen-runtime/acquired-tools",
 * }));
 * ```
 */
export function createDhyanaPlugin(config: DhyanaConfig): ZenPlugin {
    const {
        llm,
        agent,
        workDir,
        acquisitionDir,
        maxAcquisitionsPerRun = 2,
        minWeeklyDownloads = 1000,
        allowedLicenses = DEFAULT_ALLOWED_LICENSES,
    } = config;

    let metrics: DhyanaMetrics = {
        gapsDetected: 0,
        researchAttempts: 0,
        packagesEvaluated: 0,
        packagesInstalled: 0,
        toolsCreated: 0,
        toolsFailed: 0,
        acquiredToolNames: [],
    };

    let acquisitionsThisRun = 0;

    /**
     * The full acquisition pipeline.
     * Returns true if a new tool was successfully acquired.
     */
    async function acquirePipeline(context: string): Promise<boolean> {
        if (acquisitionsThisRun >= maxAcquisitionsPerRun) return false;

        // Stage 1: Detect gap
        const gap = await detectGap(llm, context);
        if (!gap) return false;

        metrics.gapsDetected++;
        metrics.researchAttempts++;

        // Stage 2: Research
        const candidates = await researchPackages(gap, workDir);
        if (candidates.length === 0) return false;

        // Stage 3: Evaluate top candidates
        for (const candidate of candidates.slice(0, 3)) {
            metrics.packagesEvaluated++;

            const evaluated = await evaluatePackage(candidate, llm, gap, workDir);

            // Safety gate
            const safety = isSafePackage(evaluated, minWeeklyDownloads, allowedLicenses);
            if (!safety.safe) continue;

            // Skip if relevance too low
            if (evaluated.relevance < 0.6) continue;

            // Skip if already installed
            if (agent.getToolNames().some((t) => t.includes(evaluated.name.replace(/-/g, "_")))) continue;

            // Stage 4: Install
            const installed = await installPackage(evaluated.name, workDir);
            if (!installed) continue;
            metrics.packagesInstalled++;

            // Stage 5: Generate wrapper
            const wrapper = await generateToolWrapper(llm, evaluated.name, evaluated.description, gap);
            if (!wrapper) {
                metrics.toolsFailed++;
                continue;
            }

            // Stage 6: Validate
            const valid = await validateWrapper(evaluated.name, workDir);
            if (!valid) {
                metrics.toolsFailed++;
                continue;
            }

            // Success! Create and register the tool
            const acquired: AcquiredTool = {
                packageName: evaluated.name,
                toolName: wrapper.toolName,
                description: evaluated.description,
                wrapperCode: wrapper.wrapperCode,
                acquiredAt: new Date().toISOString(),
                validated: true,
            };

            const tool = createToolFromAcquired(acquired);
            if (tool) {
                agent.addTool(tool);
                metrics.toolsCreated++;
                metrics.acquiredToolNames.push(wrapper.toolName);
                acquisitionsThisRun++;

                // Persist
                if (acquisitionDir) {
                    saveAcquiredTool(acquisitionDir, acquired);
                }

                return true;
            }

            metrics.toolsFailed++;
        }

        return false;
    }

    // --- Hooks ---

    const hooks: ZenPluginHooks = {
        /** On tool failure: attempt to acquire a better tool. */
        async afterAction(ctx: PluginContext, action: Action, result: ToolResult) {
            if (result.success) return;

            const context = `Tool "${action.toolName}" failed with error: ${result.error}. ` +
                `Goal: ${ctx.goal.description}. ` +
                `Parameters: ${JSON.stringify(action.parameters).slice(0, 200)}`;

            await acquirePipeline(context);
        },

        /** On agent-level error: attempt recovery acquisition. */
        async onError(ctx: PluginContext, error: Error) {
            const context = `Agent error: ${error.message}. Goal: ${ctx.goal.description}`;
            await acquirePipeline(context);
        },

        /** On evolution: proactively seek capabilities. */
        async onEvolution(ctx: PluginContext, record: SelfEvolutionRecord) {
            if (record.type !== "approach_shift") return;

            const context = `Agent is shifting approach: "${record.change}". ` +
                `Reason: ${record.reason}. Goal: ${ctx.goal.description}`;

            await acquirePipeline(context);
        },

        /** Inject acquired tools info into decision prompt. */
        async beforeDecide(ctx: PluginContext): Promise<string[]> {
            if (metrics.acquiredToolNames.length === 0) return [];

            return [
                `## 🧘 Acquired Tools (Dhyana)\n${metrics.acquiredToolNames.map((t) => `- ${t} (externally acquired)`).join("\n")}`,
            ];
        },
    };

    return {
        name: "dhyana",
        description:
            "Self-Evolution Engine — the sixth perfection (禅定). " +
            "Autonomously discovers, evaluates, installs, and integrates external packages.",
        hooks,
        install() {
            metrics = {
                gapsDetected: 0,
                researchAttempts: 0,
                packagesEvaluated: 0,
                packagesInstalled: 0,
                toolsCreated: 0,
                toolsFailed: 0,
                acquiredToolNames: [],
            };
            acquisitionsThisRun = 0;

            // Load previously acquired tools
            if (acquisitionDir) {
                const acquired = loadAcquiredTools(acquisitionDir);
                for (const acq of acquired) {
                    if (!agent.getToolNames().includes(acq.toolName)) {
                        const tool = createToolFromAcquired(acq);
                        if (tool) {
                            agent.addTool(tool);
                            metrics.acquiredToolNames.push(acq.toolName);
                        }
                    }
                }
            }
        },
    };
}
