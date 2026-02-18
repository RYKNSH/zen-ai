// ============================================================================
// ZEN AI SDK — ZenAgent
// "GOAL + Snapshot + Delta → Action. Always light. Always clear."
// ============================================================================

import { TypedEventEmitter } from "./event-emitter.js";
import { MilestoneRunner } from "./milestone-runner.js";
import type {
    ZenAgentConfig,
    ZenAgentEvents,
    Goal,
    Snapshot,
    Observation,
    Delta,
    Action,
    Tool,
    ToolResult,
    AgentState,
    ChatMessage,
    LLMToolDefinition,
} from "./types.js";

/** Default snapshot when none is provided. */
const DEFAULT_SNAPSHOT: Snapshot = {};
const DEFAULT_MAX_STEPS = 100;
const DEFAULT_MAX_RETRIES = 3;

/**
 * ZenAgent — The Present-Moment Agent.
 *
 * Holds exactly 3 things in working memory:
 * 1. **Goal** — The immutable north star
 * 2. **Snapshot** — The current state of the world
 * 3. **Delta** — The gap between Goal and Snapshot
 *
 * Everything else is retrieved on-demand via RAG (SkillDB, FailureDB)
 * or discarded at milestone boundaries (Context Reset).
 */
export class ZenAgent extends TypedEventEmitter<ZenAgentEvents> {
    // --- Core 3 elements ---
    private readonly goal: Goal;
    private snapshot: Snapshot = DEFAULT_SNAPSHOT;
    private delta: Delta | null = null;

    // --- Components ---
    private readonly llm: ZenAgentConfig["llm"];
    private readonly milestoneRunner: MilestoneRunner | null;
    private readonly snapshotFn: () => Promise<Snapshot> | Snapshot;
    private readonly tools: Map<string, Tool>;
    private readonly skillDB: ZenAgentConfig["skillDB"];
    private readonly failureDB: ZenAgentConfig["failureDB"];

    // --- Settings ---
    private readonly maxSteps: number;
    private readonly maxRetries: number;

    // --- Runtime state ---
    private stepCount = 0;
    private running = false;
    private chatHistory: ChatMessage[] = [];

    // --- Buddhist AI: Mindfulness & Dukkha state (Phase 0.5) ---
    private lastObservation: Observation | null = null;
    /** Tracks repeated failure patterns for Tanha Loop detection. */
    private failurePatternCounts: Map<string, number> = new Map();
    /** True if a craving loop (渇愛ループ) has been detected. */
    private tanhaLoopDetected = false;

    constructor(config: ZenAgentConfig) {
        super();

        // Normalize goal
        this.goal =
            typeof config.goal === "string"
                ? { description: config.goal }
                : config.goal;

        this.llm = config.llm;
        this.snapshotFn = config.snapshot ?? (() => ({}));
        this.skillDB = config.skillDB;
        this.failureDB = config.failureDB;
        this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

        // Tools
        this.tools = new Map();
        if (config.tools) {
            for (const tool of config.tools) {
                this.tools.set(tool.name, tool);
            }
        }

        // Milestones
        this.milestoneRunner = config.milestones?.length
            ? new MilestoneRunner({
                milestones: config.milestones,
                onReset: () => this.resetContext(),
            })
            : null;
    }

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Run the agent's main loop until the goal is reached or maxSteps is hit.
     */
    async run(): Promise<void> {
        if (this.running) {
            throw new Error("Agent is already running");
        }

        this.running = true;
        this.emit("agent:start", { goal: this.goal });

        try {
            while (this.running && this.stepCount < this.maxSteps) {
                // 1. Capture the present moment (L1: MindfulObserver)
                this.snapshot = await this.snapshotFn();
                this.lastObservation = {
                    data: this.snapshot,
                    biasScore: this.tanhaLoopDetected ? 0.8 : 0.1,
                    mindfulnessLevel: this.tanhaLoopDetected ? 0.3 : 0.9,
                    observedAt: new Date(),
                };
                this.emit("observation:captured", {
                    biasScore: this.lastObservation.biasScore,
                    mindfulnessLevel: this.lastObservation.mindfulnessLevel,
                });

                // 2. Compute Delta (the gap) + Dukkha metrics (L3)
                this.delta = await this.computeDelta();

                // 2b. Emit dukkha metrics if available
                if (this.delta.sufferingDelta !== undefined && this.delta.egoNoise !== undefined) {
                    this.emit("dukkha:evaluated", {
                        sufferingDelta: this.delta.sufferingDelta,
                        egoNoise: this.delta.egoNoise,
                    });
                }

                // 3. Check if we're done (涅槃状態: isComplete)
                if (this.delta.isComplete) {
                    break;
                }

                // 4. Check milestone
                if (this.milestoneRunner && !this.milestoneRunner.isComplete) {
                    const reached = await this.milestoneRunner.checkReached(
                        this.snapshot,
                        this.llm,
                        this.goal,
                    );
                    if (reached) {
                        const current = this.milestoneRunner.current!;
                        const failures = this.failureDB?.exportCurrent() ?? [];
                        const next = await this.milestoneRunner.reset(failures);
                        this.emit("milestone:reached", {
                            milestoneId: current.id,
                            resources: current.resources,
                        });
                        this.emit("context:reset", {
                            previousMilestone: current.id,
                            nextMilestone: next?.id ?? null,
                        });
                    }
                }

                // 5. Decide next action
                const action = await this.decide();
                if (!action) break;

                this.stepCount++;
                this.emit("action:start", { action, step: this.stepCount });

                // 6. Execute tool
                const result = await this.executeTool(action);
                this.emit("action:complete", {
                    action,
                    result,
                    step: this.stepCount,
                });

                // 7. Record failure if tool failed
                if (!result.success && this.failureDB) {
                    await this.recordFailure(action, result);
                }
            }

            this.emit("agent:complete", {
                goal: this.goal,
                totalSteps: this.stepCount,
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.emit("agent:error", { error: err, step: this.stepCount });
            throw err;
        } finally {
            this.running = false;
        }
    }

    /** Stop the agent gracefully. */
    stop(): void {
        this.running = false;
    }

    /** Get the current agent state (for serialization / recovery). */
    getState(): AgentState {
        return {
            goal: this.goal,
            currentMilestoneIndex:
                this.milestoneRunner?.currentMilestoneIndex ?? 0,
            stepCount: this.stepCount,
            snapshot: this.snapshot,
            delta: this.delta,
            failures: this.failureDB?.exportCurrent() ?? [],
            startedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        };
    }

    // =========================================================================
    // Core Logic
    // =========================================================================

    /**
     * Compute the Delta between Goal and Snapshot.
     * Uses LLM to analyze the gap.
     */
    private async computeDelta(): Promise<Delta> {
        const tanhaWarning = this.tanhaLoopDetected
            ? "\n## ⚠️ Tanha Loop Detected\nRepeated failures detected. Re-evaluate approach from first principles.\n"
            : "";

        const prompt = [
            "You are an agent analyzing the gap between a goal and the current state.",
            "",
            `## Goal`,
            this.goal.description,
            this.goal.successCriteria
                ? `Success criteria: ${this.goal.successCriteria.join(", ")}`
                : "",
            "",
            `## Current State (Snapshot)`,
            JSON.stringify(this.snapshot, null, 2),
            "",
            this.milestoneRunner?.current
                ? `## Current Milestone\n${this.milestoneRunner.current.description}\nRequired resources: ${this.milestoneRunner.current.resources.join(", ")}`
                : "",
            tanhaWarning,
            "## Instructions",
            "Analyze the gap and respond in this exact JSON format:",
            '{"description": "...", "progress": 0.0, "gaps": ["gap1", "gap2"], "isComplete": false, "sufferingDelta": -0.1, "egoNoise": 0.2}',
            "",
            "- progress: 0.0 to 1.0 indicating overall progress",
            "- gaps: list of things still missing",
            "- isComplete: true only if the goal is fully satisfied",
            "- sufferingDelta: how much suffering changed (-1.0 to 1.0, negative = decreased = good)",
            "- egoNoise: self-preservation bias level (0.0 = none, 1.0 = high)",
        ].join("\n");

        const response = await this.retryLLM(() => this.llm.complete(prompt));
        return this.parseDelta(response);
    }

    /**
     * Decide the next action by consulting SkillDB, FailureDB, and the LLM.
     */
    private async decide(): Promise<Action | null> {
        if (!this.delta) return null;

        // Retrieve relevant skills and failure warnings
        const skills = this.skillDB
            ? await this.skillDB.retrieve(this.delta.description, 3)
            : [];
        const warnings = this.failureDB
            ? await this.failureDB.retrieve(this.delta.description, 3)
            : [];

        // Build system message
        const systemMessage: ChatMessage = {
            role: "system",
            content: [
                "You are ZEN AI, a present-moment agent. You act based on the current gap between goal and state.",
                "",
                `## Goal: ${this.goal.description}`,
                "",
                `## Current Delta (Gap Analysis)`,
                `Description: ${this.delta.description}`,
                `Progress: ${(this.delta.progress * 100).toFixed(0)}%`,
                `Gaps: ${this.delta.gaps.join(", ")}`,
                "",
                skills.length > 0
                    ? `## Relevant Skills\n${skills.map((s) => `- When "${s.trigger}": ${s.command} (if ${s.condition})`).join("\n")}`
                    : "",
                warnings.length > 0
                    ? `## ⚠️ Failure Warnings\n${warnings.map((w) => `- "${w.proverb}" (when: ${w.condition}, severity: ${w.severity})`).join("\n")}`
                    : "",
                "",
                "Choose the most appropriate tool to make progress. If the goal appears complete, respond with exactly: DONE",
            ]
                .filter(Boolean)
                .join("\n"),
        };

        // Include recent chat history for continuity (limited)
        const recentHistory = this.chatHistory.slice(-10);
        const messages: ChatMessage[] = [systemMessage, ...recentHistory];

        // Convert tools to LLM format
        const toolDefs: LLMToolDefinition[] = Array.from(this.tools.values()).map(
            (t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            }),
        );

        // Call LLM with function calling
        const response = await this.retryLLM(() =>
            this.llm.chat(messages, { tools: toolDefs.length > 0 ? toolDefs : undefined }),
        );

        // Check for completion signal
        if (
            response.content?.trim().toUpperCase() === "DONE" ||
            (!response.toolCalls?.length && !response.content)
        ) {
            return null;
        }

        // Extract tool call
        if (response.toolCalls?.length) {
            const tc = response.toolCalls[0];
            const action: Action = {
                toolName: tc.name,
                parameters: tc.arguments,
                reasoning: response.content ?? undefined,
            };

            // Add to chat history
            this.chatHistory.push({
                role: "assistant",
                content: response.content ?? `Using tool: ${tc.name}`,
            });

            return action;
        }

        // If LLM returned text without tool calls, treat as reasoning step
        if (response.content) {
            this.chatHistory.push({
                role: "assistant",
                content: response.content,
            });
        }

        return null;
    }

    /**
     * Execute a tool action and return the result.
     */
    private async executeTool(action: Action): Promise<ToolResult> {
        const tool = this.tools.get(action.toolName);
        if (!tool) {
            return {
                success: false,
                output: null,
                error: `Tool not found: ${action.toolName}`,
            };
        }

        try {
            const result = await tool.execute(action.parameters);

            // Add tool result to chat history
            this.chatHistory.push({
                role: "tool",
                content: JSON.stringify(result.output),
                toolCallId: action.toolName,
            });

            return result;
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            return {
                success: false,
                output: null,
                error: errorMsg,
            };
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /** Reset context after a milestone is reached. */
    private resetContext(): void {
        this.chatHistory = [];
        this.delta = null;
    }

    /** Parse a Delta from LLM response (with fallback). */
    private parseDelta(response: string): Delta {
        try {
            // Extract JSON from response (may be wrapped in markdown)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    description: String(parsed.description ?? "Unknown"),
                    progress: Number(parsed.progress ?? 0),
                    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.map(String) : [],
                    isComplete: Boolean(parsed.isComplete ?? false),
                    // Buddhist AI metrics (optional)
                    sufferingDelta: parsed.sufferingDelta != null
                        ? Number(parsed.sufferingDelta)
                        : undefined,
                    egoNoise: parsed.egoNoise != null
                        ? Number(parsed.egoNoise)
                        : undefined,
                };
            }
        } catch {
            // Fall through to default
        }

        return {
            description: response.slice(0, 200),
            progress: 0,
            gaps: ["Unable to parse delta"],
            isComplete: false,
        };
    }

    /** Record a failure as a proverb in FailureDB + Tanha Loop detection. */
    private async recordFailure(
        action: Action,
        result: ToolResult,
    ): Promise<void> {
        if (!this.failureDB) return;

        const proverb = `Avoid using ${action.toolName} with these parameters when ${result.error}`;
        const condition = `When attempting: ${action.reasoning ?? action.toolName}`;

        await this.failureDB.store({
            id: `fk_${Date.now()}`,
            proverb,
            condition,
            severity: "MEDIUM",
            source: `step_${this.stepCount}`,
        });

        this.emit("failure:recorded", { proverb, condition });

        // --- Tanha Loop Detection (渇愛ループ検出) ---
        // Same tool + same error pattern repeating = craving loop
        const patternKey = `${action.toolName}:${result.error ?? "unknown"}`;
        const count = (this.failurePatternCounts.get(patternKey) ?? 0) + 1;
        this.failurePatternCounts.set(patternKey, count);
        if (count >= 3) {
            this.tanhaLoopDetected = true;
        }
    }

    /** Retry an LLM call with exponential backoff. */
    private async retryLLM<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        for (let i = 0; i < this.maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError =
                    error instanceof Error ? error : new Error(String(error));
                if (i < this.maxRetries - 1) {
                    await new Promise((r) => setTimeout(r, Math.pow(2, i) * 1000));
                }
            }
        }
        throw lastError;
    }
}
