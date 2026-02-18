// ============================================================================
// ZEN AI SDK — ZenAgent
// "GOAL + Snapshot + Delta → Action. Always light. Always clear."
// ============================================================================

import { TypedEventEmitter } from "./event-emitter.js";
import { MilestoneRunner } from "./milestone-runner.js";
import type {
    Action,
    Delta,
    Goal,
    Observation,
    Snapshot,
    Tool,
    ToolResult,
    ChatMessage,
    LLMToolDefinition,
    ZenAgentConfig,
    ZenAgentEvents,
    AgentState,
    CausalLink,
    AwakeningStageResult,
    KarmaType,
    SelfModel,
    SelfEvolutionRecord,
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
    private readonly karmaMemoryDB: ZenAgentConfig["karmaMemoryDB"];

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

    // --- Phase 2: Causal graph state ---
    private recentActions: Array<{ id: string; toolName: string; success: boolean; step: number }> = [];

    // --- Phase M1: User instruction count as suffering proxy ---
    private userInstructionCount = 0;

    // --- Phase 3: Seven Factors state ---
    private awakeningEnabled = false;

    // --- Phase 4: Anatta Self-Model ---
    private selfModel: SelfModel = {
        toolStats: {},
        sufferingTrend: [],
        evolutionLog: [],
        activeStrategies: {
            toolPreferences: {},
            avoidPatterns: [],
            approachHints: [],
        },
    };

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
        this.karmaMemoryDB = config.karmaMemoryDB;
        this.maxSteps = config.maxSteps ?? DEFAULT_MAX_STEPS;
        this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;

        // Enable Seven Factors pipeline if karmaMemoryDB is provided
        this.awakeningEnabled = !!config.karmaMemoryDB;

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

                // 5. Decide next action (Phase 3: Seven Factors pipeline if enabled)
                const action = this.awakeningEnabled
                    ? await this.decideWithAwakening()
                    : await this.decide();
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

                // 6a. Update self-model (Phase 4: Anatta)
                this.updateSelfModel(action.toolName, result.success);

                // 6b. Track action for causal analysis (Phase 2)
                this.recentActions.push({
                    id: `action_${this.stepCount}`,
                    toolName: action.toolName,
                    success: result.success,
                    step: this.stepCount,
                });

                // 6c. Causal analysis (Phase 2) — analyze cause-effect after each step
                if (this.karmaMemoryDB && this.recentActions.length >= 2) {
                    await this.analyzeCausality();
                }

                // 7. Record failure if tool failed
                if (!result.success && (this.failureDB || this.karmaMemoryDB)) {
                    await this.recordFailure(action, result);
                }
            }

            // Apply impermanence (無常) at end of run (Phase 1.5)
            if (this.karmaMemoryDB) {
                await this.karmaMemoryDB.applyImpermanence();
            }

            // Self-evolution check (Phase 4: Anatta)
            await this.evolveIfNeeded();

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
            buddhistMetrics: {
                sufferingDelta: this.delta?.sufferingDelta,
                egoNoise: this.delta?.egoNoise,
                tanhaLoopDetected: this.tanhaLoopDetected,
                karmaCount: this.recentActions.filter(a => !a.success).length,
                userInstructionCount: this.userInstructionCount ?? 0,
            },
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

        // Build active strategy sections (Closed-Loop Learning output)
        const strat = this.selfModel.activeStrategies;
        const stratSections: string[] = [];

        if (Object.keys(strat.toolPreferences).length > 0) {
            const prefs = Object.entries(strat.toolPreferences)
                .sort(([, a], [, b]) => b - a)
                .map(([tool, weight]) => `- ${tool}: ${(weight * 100).toFixed(0)}% preference`)
                .join("\n");
            stratSections.push(`## 🧭 Tool Preferences (learned)\n${prefs}`);
        }

        if (strat.avoidPatterns.length > 0) {
            stratSections.push(
                `## 🚫 Avoid Patterns (learned from past suffering)\n${strat.avoidPatterns.map((p) => `- ${p}`).join("\n")}`,
            );
        }

        if (strat.approachHints.length > 0) {
            stratSections.push(
                `## 💡 Approach Guidance (self-evolved)\n${strat.approachHints.map((h) => `- ${h}`).join("\n")}`,
            );
        }

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
                ...stratSections,
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
                toolCallId: tc.id,
            };

            // Add to chat history WITH tool_calls (OpenAI requires this)
            this.chatHistory.push({
                role: "assistant",
                content: response.content ?? "",
                toolCalls: response.toolCalls,
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
                toolCallId: action.toolCallId ?? action.toolName,
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
        const proverb = `Avoid using ${action.toolName} with these parameters when ${result.error}`;
        const condition = `When attempting: ${action.reasoning ?? action.toolName}`;

        // Store to FailureDB if available
        if (this.failureDB) {
            await this.failureDB.store({
                id: `fk_${Date.now()}`,
                proverb,
                condition,
                severity: "MEDIUM",
                source: `step_${this.stepCount}`,
            });
        }

        this.emit("failure:recorded", { proverb, condition });

        // --- Tanha Loop Detection (渇愛ループ検出) ---
        const patternKey = `${action.toolName}:${result.error ?? "unknown"}`;
        const count = (this.failurePatternCounts.get(patternKey) ?? 0) + 1;
        this.failurePatternCounts.set(patternKey, count);
        if (count >= 3) {
            this.tanhaLoopDetected = true;
            this.emit("tanha:loop:detected", { pattern: patternKey, count });
        }

        // --- Phase 1.5: Store to KarmaMemory ---
        if (this.karmaMemoryDB) {
            const karmaType: KarmaType = count >= 3 ? "unskillful" : count >= 2 ? "neutral" : "unskillful";
            const causalChain = this.recentActions
                .filter(a => !a.success)
                .map(a => a.id)
                .slice(-5);

            const karmaId = `karma_${Date.now()}`;
            await this.karmaMemoryDB.store({
                id: karmaId,
                proverb,
                condition,
                severity: count >= 3 ? "HIGH" : "MEDIUM",
                source: `step_${this.stepCount}`,
                causalChain,
                transferWeight: Math.min(1.0, 0.3 + count * 0.1),
                karmaType,
                occurrences: 1,
                lastSeen: new Date().toISOString(),
            });

            this.emit("karma:stored", { karmaId, karmaType, causalChain });
        }
    }

    // =========================================================================
    // Phase 2: Causal Analysis (LLM-powered)
    // =========================================================================

    /**
     * Analyze causal relationships between recent actions using LLM.
     * Infers which actions caused which outcomes.
     */
    private async analyzeCausality(): Promise<void> {
        if (this.recentActions.length < 2) return;

        const last = this.recentActions[this.recentActions.length - 1];
        const prev = this.recentActions[this.recentActions.length - 2];

        // Only analyze when something failed after a previous action
        if (last.success) return;

        const prompt = [
            "## Causal Analysis",
            `Previous action: ${prev.toolName} (${prev.success ? "success" : "failure"})`,
            `Current action: ${last.toolName} (failure)`,
            "",
            "Did the previous action likely CAUSE the current failure?",
            'Respond in JSON: {"isCausal": true/false, "strength": 0.0-1.0, "reasoning": "..."}',
        ].join("\n");

        try {
            const response = await this.retryLLM(() => this.llm.complete(prompt));
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.isCausal) {
                    const link: CausalLink = {
                        causeId: prev.id,
                        effectId: last.id,
                        strength: Number(parsed.strength ?? 0.5),
                        reasoning: String(parsed.reasoning ?? ""),
                    };
                    this.emit("causal:analyzed", { links: [link] });

                    // Update karma causal chain if available
                    if (this.karmaMemoryDB) {
                        const karmaEntries = await this.karmaMemoryDB.retrieve(last.toolName, 1);
                        if (karmaEntries.length > 0) {
                            const existing = karmaEntries[0];
                            const updatedChain = [...new Set([...existing.causalChain, prev.id])];
                            await this.karmaMemoryDB.store({
                                ...existing,
                                causalChain: updatedChain,
                            });
                        }
                    }
                }
            }
        } catch {
            // Causal analysis is best-effort, don't fail the run
        }
    }

    // =========================================================================
    // Phase 3: Seven Factors of Awakening Pipeline
    // =========================================================================

    /**
     * Decide with the Seven Factors of Awakening pipeline.
     * Each factor acts as a processing stage that refines the decision.
     *
     * 1. 択法 (Investigation): Generate hypotheses
     * 2. 念 (Mindfulness): Remove bias
     * 3. 精進 (Energy): Calibrate effort level
     * 4. 喜 (Joy): Check intrinsic reward
     * 5. 軽安 (Tranquility): Regularize / simplify
     * 6. 定 (Concentration): Focus on causal structure
     * 7. 捨 (Equanimity): Let go of attachment to outcome
     */
    private async decideWithAwakening(): Promise<Action | null> {
        if (!this.delta) return null;

        // Retrieve karma wisdom (Phase 1.5)
        const karmaWisdom = this.karmaMemoryDB
            ? await this.karmaMemoryDB.retrieve(this.delta.description, 3)
            : [];
        const habitualPatterns = this.karmaMemoryDB
            ? await this.karmaMemoryDB.getHabitualPatterns(3)
            : [];

        // Stage 1: 択法 (Investigation) — Generate hypotheses using all knowledge
        const skills = this.skillDB
            ? await this.skillDB.retrieve(this.delta.description, 3)
            : [];
        const warnings = this.failureDB
            ? await this.failureDB.retrieve(this.delta.description, 3)
            : [];

        const investigationPrompt = [
            "## Stage 1: 択法 (Investigation)",
            "Generate 2-3 possible approaches to address the current gap.",
            "",
            `Goal: ${this.goal.description}`,
            `Delta: ${this.delta.description}`,
            `Progress: ${(this.delta.progress * 100).toFixed(0)}%`,
            `Gaps: ${this.delta.gaps.join(", ")}`,
            "",
            skills.length > 0
                ? `Relevant Skills: ${skills.map(s => s.command).join("; ")}`
                : "",
            warnings.length > 0
                ? `⚠️ Failure Warnings: ${warnings.map(w => w.proverb).join("; ")}`
                : "",
            karmaWisdom.length > 0
                ? `🔮 Karma Wisdom: ${karmaWisdom.map(k => `"${k.proverb}" (weight: ${k.transferWeight.toFixed(1)}, seen ${k.occurrences}x)`).join("; ")}`
                : "",
            habitualPatterns.length > 0
                ? `⚠️ Habitual Patterns (渇愛候補): ${habitualPatterns.map(h => h.proverb).join("; ")}`
                : "",
            "",
            'Respond in JSON: {"hypotheses": ["approach 1", "approach 2"]}',
        ].filter(Boolean).join("\n");

        const investigationResp = await this.retryLLM(() => this.llm.complete(investigationPrompt));
        this.emit("awakening:stage", {
            stage: "investigation",
            output: investigationResp,
            confidence: 0.7,
            filtered: false,
        });

        // Stage 2: 念 (Mindfulness) — Remove bias from hypotheses
        const mindfulnessPrompt = [
            "## Stage 2: 念 (Mindfulness) — Bias Removal",
            `Bias Score: ${this.lastObservation?.biasScore ?? 0}`,
            `Tanha Loop Active: ${this.tanhaLoopDetected}`,
            "",
            "Review these hypotheses and REMOVE any that:",
            "- Repeat a pattern that has already failed (渇愛)",
            "- Are driven by ego/self-preservation rather than goal-service",
            "- Show confirmation bias (trying to prove previous approach was right)",
            "",
            `Hypotheses: ${investigationResp}`,
            "",
            'Respond in JSON: {"filtered": ["surviving approach"], "removed": ["removed approach"], "reasoning": "..."}',
        ].join("\n");

        const mindfulnessResp = await this.retryLLM(() => this.llm.complete(mindfulnessPrompt));
        this.emit("awakening:stage", {
            stage: "mindfulness",
            output: mindfulnessResp,
            confidence: 0.8,
            filtered: true,
        });

        // Stages 3-7: Combined into final decision (energy + joy + tranquility + concentration + equanimity)
        // These are combined to avoid excessive LLM calls while preserving the seven-factor structure
        const toolDefs: LLMToolDefinition[] = Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        }));

        const finalDecisionPrompt: ChatMessage = {
            role: "system",
            content: [
                "You are ZEN AI with Seven Factors of Awakening.",
                "",
                `## Goal: ${this.goal.description}`,
                `## Delta: ${this.delta.description} (${(this.delta.progress * 100).toFixed(0)}%)`,
                `## Gaps: ${this.delta.gaps.join(", ")}`,
                "",
                "## Awakening Pipeline Results",
                `Investigation (択法): ${investigationResp}`,
                `Mindfulness (念): ${mindfulnessResp}`,
                "",
                "## Remaining Factors (apply internally):",
                "3. 精進 (Energy): Choose the approach that requires MINIMUM effort for MAXIMUM progress",
                "4. 喜 (Joy): Prefer approaches that make the system MORE elegant, not just functional",
                "5. 軽安 (Tranquility): Prefer the SIMPLEST approach. Avoid over-engineering",
                "6. 定 (Concentration): Focus on the ROOT CAUSE, not symptoms",
                "7. 捨 (Equanimity): Do not cling to previous approaches. Choose freely",
                "",
                this.delta.sufferingDelta !== undefined
                    ? `Suffering Delta: ${this.delta.sufferingDelta} (negative = good)`
                    : "",
                this.delta.egoNoise !== undefined
                    ? `Ego Noise: ${this.delta.egoNoise}`
                    : "",
                "",
                "Choose the most appropriate tool. If complete, respond: DONE",
            ].filter(Boolean).join("\n"),
        };

        const recentHistory = this.chatHistory.slice(-6);
        const messages: ChatMessage[] = [finalDecisionPrompt, ...recentHistory];

        const response = await this.retryLLM(() =>
            this.llm.chat(messages, { tools: toolDefs.length > 0 ? toolDefs : undefined }),
        );

        this.emit("awakening:stage", {
            stage: "equanimity",
            output: response.content ?? "tool_call",
            confidence: 0.9,
            filtered: false,
        });

        // Parse response (same as regular decide)
        if (
            response.content?.trim().toUpperCase() === "DONE" ||
            (!response.toolCalls?.length && !response.content)
        ) {
            return null;
        }

        if (response.toolCalls?.length) {
            const tc = response.toolCalls[0];
            const action: Action = {
                toolName: tc.name,
                parameters: tc.arguments,
                reasoning: response.content ?? undefined,
            };
            this.chatHistory.push({
                role: "assistant",
                content: response.content ?? `Using tool: ${tc.name}`,
            });
            return action;
        }

        if (response.content) {
            this.chatHistory.push({
                role: "assistant",
                content: response.content,
            });
        }

        return null;
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

    // =========================================================================
    // Phase 4: Anatta Self-Evolver (無我・自己進化)
    // =========================================================================

    /** Update the self-model after each tool execution. */
    private updateSelfModel(toolName: string, success: boolean): void {
        // Update tool stats
        if (!this.selfModel.toolStats[toolName]) {
            this.selfModel.toolStats[toolName] = {
                uses: 0,
                successes: 0,
                failures: 0,
                avgSufferingDelta: 0,
            };
        }
        const stats = this.selfModel.toolStats[toolName];
        stats.uses++;
        if (success) stats.successes++;
        else stats.failures++;

        // Update suffering trend
        const currentSuffering = this.delta?.sufferingDelta ?? 0;
        stats.avgSufferingDelta =
            (stats.avgSufferingDelta * (stats.uses - 1) + currentSuffering) / stats.uses;
        this.selfModel.sufferingTrend.push(currentSuffering);
        // Keep last 20 entries
        if (this.selfModel.sufferingTrend.length > 20) {
            this.selfModel.sufferingTrend.shift();
        }
    }

    /** Check if self-evolution is needed and apply if so. */
    private async evolveIfNeeded(): Promise<void> {
        const trend = this.selfModel.sufferingTrend;
        if (trend.length < 5) return; // Need enough data

        // Check: is suffering trending upward?
        const recentAvg =
            trend.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const EVOLUTION_THRESHOLD = 0.4;

        if (recentAvg < EVOLUTION_THRESHOLD && !this.tanhaLoopDetected) return;

        // Ask LLM for self-evolution proposal
        const prompt = [
            "You are analyzing an AI agent's self-model to propose improvements.",
            "",
            "## Tool Usage Statistics",
            JSON.stringify(this.selfModel.toolStats, null, 2),
            "",
            "## Suffering Trend (last 20 steps)",
            JSON.stringify(trend),
            "",
            "## Current State",
            `Tanha Loop Detected: ${this.tanhaLoopDetected}`,
            `Recent Avg Suffering: ${recentAvg.toFixed(3)}`,
            `Total Evolutions: ${this.selfModel.evolutionLog.length}`,
            "",
            "Propose ONE concrete change to reduce suffering. Respond in JSON:",
            '{"change": "...", "reason": "...", "type": "tool_preference|approach_shift|milestone_reorder|strategy_change", "confidence": 0.0-1.0}',
        ].join("\n");

        try {
            const raw = await this.retryLLM(() => this.llm.complete(prompt));
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match) return;

            const proposal = JSON.parse(match[0]) as {
                change: string;
                reason: string;
                type: string;
                confidence: number;
            };

            if (proposal.confidence < 0.5) return; // Low confidence — skip

            const record: SelfEvolutionRecord = {
                timestamp: new Date().toISOString(),
                change: proposal.change,
                reason: proposal.reason,
                type: (proposal.type as SelfEvolutionRecord["type"]) || "strategy_change",
            };

            // =====================================================
            // CLOSED-LOOP LEARNING: Apply proposal to activeStrategies
            // This is THE moment where evolution becomes action.
            // =====================================================
            this.applyEvolution(record);
            this.selfModel.evolutionLog.push(record);
            this.emit("anatta:evolved", record);
        } catch {
            // Silently skip evolution if LLM fails
        }
    }

    /**
     * Apply a self-evolution record to activeStrategies.
     * This closes the learning loop: evolve → strategy → decide → act → observe → evolve.
     */
    private applyEvolution(record: SelfEvolutionRecord): void {
        const strat = this.selfModel.activeStrategies;

        switch (record.type) {
            case "tool_preference": {
                // Parse tool name from the change description
                // e.g. "Prefer file_read over http_request" → boost file_read
                const toolNames = Array.from(this.tools.keys());
                for (const toolName of toolNames) {
                    if (record.change.toLowerCase().includes(toolName.toLowerCase())) {
                        // Boost mentioned tool, or reduce it if "avoid" is mentioned
                        const isAvoid = record.change.toLowerCase().includes("avoid") ||
                            record.change.toLowerCase().includes("reduce") ||
                            record.change.toLowerCase().includes("less");
                        const current = strat.toolPreferences[toolName] ?? 0.5;
                        strat.toolPreferences[toolName] = isAvoid
                            ? Math.max(0, current - 0.2)
                            : Math.min(1, current + 0.2);
                    }
                }
                break;
            }
            case "approach_shift": {
                // Add as approach hint (max 5 hints)
                strat.approachHints.push(record.change);
                if (strat.approachHints.length > 5) strat.approachHints.shift();
                break;
            }
            case "strategy_change": {
                // Add as approach hint
                strat.approachHints.push(record.change);
                if (strat.approachHints.length > 5) strat.approachHints.shift();
                break;
            }
            case "milestone_reorder": {
                // Record as approach hint (milestone reordering is advisory)
                strat.approachHints.push(`Milestone hint: ${record.change}`);
                if (strat.approachHints.length > 5) strat.approachHints.shift();
                break;
            }
        }

        // Auto-generate avoidPatterns from high-suffering tools
        for (const [toolName, stats] of Object.entries(this.selfModel.toolStats)) {
            if (stats.failures > 3 && stats.failures / stats.uses > 0.6) {
                const pattern = `Tool "${toolName}" has ${(stats.failures / stats.uses * 100).toFixed(0)}% failure rate — consider alternatives`;
                if (!strat.avoidPatterns.includes(pattern)) {
                    strat.avoidPatterns.push(pattern);
                    // Max 5 avoid patterns
                    if (strat.avoidPatterns.length > 5) strat.avoidPatterns.shift();
                }
            }
        }
    }

    /** Get the current self-model (for external inspection / testing). */
    getSelfModel(): Readonly<SelfModel> {
        return this.selfModel;
    }
}
