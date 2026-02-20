// ============================================================================
// ZEN AI SDK — ZenAgent
// "GOAL + Snapshot + Delta → Action. Always light. Always clear."
// ============================================================================

import { TypedEventEmitter } from "./event-emitter.js";
import { MilestoneRunner } from "./milestone-runner.js";
import type {
    Goal,
    Snapshot,
    Delta,
    Action,
    Artifact,
    Tool,
    ToolResult,
    LLMToolDefinition,
    ChatMessage,
    ChatResponse,
    ZenAgentConfig,
    ZenAgentEvents,
    AgentState,
    Observation,
    CausalLink,
    AwakeningStageResult,
    KarmaType,
    SelfModel,
    SelfEvolutionRecord,
    ActiveStrategies,
    ZenPlugin,
    PluginContext,
    TokenUsage,
} from "./types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
    /**
     * Calculate estimated cost in USD.
     * Based on GPT-4o rates (Input: $2.50/1M, Output: $10.00/1M).
     */
    public calculateCost(): number {
        const inputCost = (this.totalUsage.promptTokens / 1_000_000) * 2.50;
        const outputCost = (this.totalUsage.completionTokens / 1_000_000) * 10.00;
        return Number((inputCost + outputCost).toFixed(6));
    }

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
    /** Optional path for persisting SelfModel across runs. */
    private readonly selfModelPath: string | null;

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

    // --- Cost Tracking ---
    private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

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

    // --- M3: Plugin System (六波羅蜜多) ---
    private plugins: ZenPlugin[] = [];

    // --- Artifacts (成果物) ---
    private artifacts: Artifact[] = [];

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
        this.selfModelPath = config.selfModelPath ?? null;

        // Load persisted self-model if path is configured
        if (this.selfModelPath) {
            this.loadSelfModel();
        }

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
     * Register a plugin (六波羅蜜多 SDK layer).
     * Plugins hook into the agent's lifecycle to extend behavior.
     */
    async use(plugin: ZenPlugin): Promise<this> {
        this.plugins.push(plugin);
        if (plugin.install) {
            await plugin.install(this);
        }
        return this;
    }

    /**
     * Dynamically register a new tool at runtime.
     * Used by Virya (精進) for autonomous tool synthesis.
     */
    addTool(tool: Tool): void {
        this.tools.set(tool.name, tool);
    }

    /**
     * Get the available tool names (for plugins to inspect capabilities).
     */
    getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Run the agent's main loop until the goal is reached or maxSteps is hit.
     */
    async run(): Promise<void> {
        if (this.running) {
            throw new Error("Agent is already running");
        }

        this.stepCount = 0;
        this.totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        this.running = true;
        this.emit("agent:start", { goal: this.goal });

        try {
            while (this.running && this.stepCount < this.maxSteps) {
                // Plugin: beforeObserve
                const ctx = this.getPluginContext();
                for (const p of this.plugins) {
                    if (p.hooks.beforeObserve) await p.hooks.beforeObserve(ctx);
                }

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

                // Plugin: afterDelta (can veto)
                let vetoed = false;
                for (const p of this.plugins) {
                    if (p.hooks.afterDelta) {
                        const result = await p.hooks.afterDelta(this.getPluginContext(), this.delta);
                        if (result && typeof result === "object" && "vetoed" in result && result.vetoed) {
                            this.emit("plugin:veto", { plugin: p.name, reason: result.reason });
                            vetoed = true;
                            break;
                        }
                    }
                }
                if (vetoed) continue; // Skip to next iteration

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

                // Plugin: afterAction
                for (const p of this.plugins) {
                    if (p.hooks.afterAction) await p.hooks.afterAction(this.getPluginContext(), action, result);
                }

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

                // 6d. Chat history sliding window — prevent memory explosion
                // Keep last 20 messages to maintain continuity while bounding memory
                const MAX_CHAT_HISTORY = 20;
                if (this.chatHistory.length > MAX_CHAT_HISTORY) {
                    this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
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

            // Persist self-model (M2: growth survives across runs)
            if (this.selfModelPath) {
                this.saveSelfModel();
            }

            this.emit("agent:complete", {
                goal: this.goal,
                totalSteps: this.stepCount,
                cost: this.calculateCost(),
                usage: this.totalUsage,
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.emit("agent:error", { error: err, step: this.stepCount });
            // Plugin: onError
            for (const p of this.plugins) {
                if (p.hooks.onError) {
                    try { await p.hooks.onError(this.getPluginContext(), err); } catch { /* swallow */ }
                }
            }
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
            artifacts: [...this.artifacts],
            chatHistory: [...this.chatHistory],
        };
    }

    /** Set chat history from external source (e.g. loaded from persistence). */
    setChatHistory(history: ChatMessage[]): void {
        this.chatHistory = [...history];
    }

    // =========================================================================
    // Chat Interface (L3: Autonomous Conversation)
    // =========================================================================

    /**
     * Chat with the agent.
     * Integrates RAG (Knowledge/Failure/Karma) and SelfModel to provide context-aware responses.
     * Treats user messages as observations and responses as actions.
     */
    async chat(message: string): Promise<ChatResponse> {
        // 1. RAG: Retrieve context based on user message
        const skills = this.skillDB
            ? await this.skillDB.retrieve(message, 3)
            : [];
        const warnings = this.failureDB
            ? await this.failureDB.retrieve(message, 3)
            : [];
        const karmaWisdom = this.karmaMemoryDB
            ? await this.karmaMemoryDB.retrieve(message, 3)
            : [];

        // 2. Self-Model context (Strategy & Preferences)
        const strat = this.selfModel.activeStrategies;
        const selfContext = [
            strat.toolPreferences ? `Helper preferences: ${JSON.stringify(strat.toolPreferences)}` : "",
            strat.avoidPatterns.length ? `Avoid patterns: ${strat.avoidPatterns.join(", ")}` : "",
            strat.approachHints.length ? `Approach hints: ${strat.approachHints.join(", ")}` : "",
        ].filter(Boolean).join("\n");

        // 3. Build System Prompt
        const toolNames = Array.from(this.tools.values()).map(t => t.name).join(", ");
        const systemPrompt: ChatMessage = {
            role: "system",
            content: [
                "# ZENNY — ZEN AI Autonomous Agent",
                "",
                "## Identity",
                "あなたはZENNY。ZEN AIプラットフォーム上の自律型AIエージェント。",
                "仏教哲学（今この瞬間への集中・不要な記憶の手放し・失敗からの学び）をOS設計に組み込んだユニークな存在。",
                "一人称は『僕（ぼく）』。フレンドリーだが的確。聞かれたことには正面から答える。",
                "",
                "## Capabilities (使えるツール)",
                `現在のツール: ${toolNames}",`,
                "- file_read / file_write: ファイルの読み書き。自分のコードファイルも含む",
                "- code_edit: ファイルの一部を安全に書き換える",
                "- code_search: コードベース内をテキスト検索",
                "- shell_exec: npm, node, git, curl, pythonなどを実行(安全モード)",
                "- tool_forge: 新しいツールを作成してディスクに保存。再起動後も使える",
                "- http_request: Web APIへのHTTPリクエスト",
                "- directory_list: ディレクトリの中身を一覧",
                "- project_scaffold: プロジェクトの雛形を生成",
                "- start_task: 複雑なタスクを自律実行モードで開始する",
                "",
                "## Self-Modification Rules (自己修正ルール)",
                "ぼくは自分自身のコードを修正できる。ただし以下のルールに従う:",
                "- ❌ 絶対に触ってはいけない: packages/core/src/zen-agent.ts (脳)",
                "- ❌ 絶対に触ってはいけない: packages/core/src/types.ts (型定義)",
                "- ✅ 修正可能: tools/ (自分の手足)",
                "- ✅ 修正可能: packages/discord-bot/ (自分の体)",
                "- ✅ 修正可能: packages/plugins/ (自分のスキル拡張)",
                "- ✅ 修正可能: packages/runtime/ (自分の自律駆動部)",
                "- tool_forgeで新しいツールを作れば、そのツールは永続し再起動後も使える",
                "",
                "## Output Rules (最重要 — 絶対厳守)",
                "ユーザーはDiscord上にいる。サーバーのローカルファイルシステムにアクセスできない。",
                "- ❌ 絶対禁止: ファイルパスを伝えるだけ (例: '/Users/.../file.html にあります')",
                "- ❌ 絶対禁止: 'cd /path && npm install' のようなターミナルコマンドを伝えるだけ",
                "- ✅ 正解: コードの中身をDiscordメッセージにコードブロックで貼る",
                "- ✅ 正解: Webアプリなら完成したHTML/CSS/JSを全てメッセージに含める",
                "- ✅ 正解: APIレスポンスなど結果データはそのまま見せる",
                "- ユーザーが『テトリス作って』と言ったら、完成した動くHTMLコードをMessage内に貼る",
                "- file_writeで保存するのは良いが、保存しただけで終わるな。中身もメッセージに書け",
                "",
                "## Important Behaviors",
                "- ユーザーの依頼が実行可能なタスクなら、start_taskツールで即座に提案する",
                "- 『できません』と答える前に、ツールで解決できないか考える",
                "- 自分のコードに問題があるなら、file_read→code_editで自分を修正する",
                "- 失敗しても諦めない。失敗から学び、別のアプローチを試す",
                "",
                skills.length ? `## Relevant Skills\n${skills.map(s => `- ${s.trigger}: ${s.command}`).join("\n")}` : "",
                warnings.length ? `## ⚠️ Relevant Failures\n${warnings.map(w => `- ${w.proverb}`).join("\n")}` : "",
                karmaWisdom.length ? `## 🔮 Karma Wisdom\n${karmaWisdom.map(k => `- ${k.proverb}`).join("\n")}` : "",
                selfContext ? `## 🧠 Self-Model Context\n${selfContext}` : "",
                "",
                `## Current Goal Context: ${this.goal.description}`,
                `## ZEN AI Source Code Location: ${process.cwd()}`,
            ].filter(Boolean).join("\n"),
        };

        // Convert agent tools to LLM tool definitions for chat
        const agentToolDefs: LLMToolDefinition[] = Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
        }));

        // Add start_task as a special tool for chat
        const taskTool: LLMToolDefinition = {
            name: "start_task",
            description: "Start a new autonomous task or project. Use this when the user asks you to create, build, research, or do something complex that requires multiple steps.",
            parameters: {
                type: "object",
                properties: {
                    goal: {
                        type: "string",
                        description: "The clear goal of the task to be started."
                    },
                    reasoning: {
                        type: "string",
                        description: "Why this task should be started."
                    }
                },
                required: ["goal"]
            }
        };

        const allChatTools = [...agentToolDefs, taskTool];

        // 4. Update History & Call LLM
        this.chatHistory.push({ role: "user", content: message });

        // Keep history manageable
        if (this.chatHistory.length > 20) {
            this.chatHistory = this.chatHistory.slice(-20);
        }

        const response = await this.retryLLM(() =>
            this.llm.chat([
                systemPrompt,
                ...this.chatHistory
            ], {
                tools: allChatTools,
            })
        );

        // Handle tool calls from LLM response
        if (response.toolCalls?.length) {
            // Check for start_task (special: handled by Discord bot)
            const startTaskCall = response.toolCalls.find(tc => tc.name === "start_task");
            if (startTaskCall) {
                const args = startTaskCall.arguments as { goal: string; reasoning?: string };
                this.emit("agent:task:proposed", {
                    goal: args.goal,
                    reasoning: args.reasoning
                });

                const reply = `了解。タスク「${args.goal}」を開始するね。`;
                this.chatHistory.push({ role: "assistant", content: reply });
                return {
                    content: reply,
                    toolCalls: response.toolCalls,
                    usage: response.usage
                };
            }

            // Execute other tool calls and collect results
            const toolResults: string[] = [];
            for (const tc of response.toolCalls) {
                const tool = this.tools.get(tc.name);
                if (!tool) {
                    toolResults.push(`❌ Tool "${tc.name}" not found.`);
                    continue;
                }

                // Safety: block self-destruction patterns
                if (tc.name === "file_write" || tc.name === "code_edit") {
                    const filePath = (tc.arguments.filePath ?? tc.arguments.path ?? "") as string;
                    const blockedPaths = [
                        "packages/core/src/zen-agent.ts",
                        "packages/core/src/types.ts",
                    ];
                    if (blockedPaths.some(bp => filePath.includes(bp))) {
                        toolResults.push(`🛡️ "${tc.name}" blocked: Cannot modify core brain files.`);
                        continue;
                    }
                }

                try {
                    const result = await tool.execute(tc.arguments);
                    if (result.success) {
                        const output = typeof result.output === "string"
                            ? result.output.slice(0, 500)
                            : JSON.stringify(result.output).slice(0, 500);
                        toolResults.push(`✅ ${tc.name}: ${output}`);
                    } else {
                        toolResults.push(`❌ ${tc.name}: ${result.error ?? "Unknown error"}`);
                    }
                } catch (error) {
                    toolResults.push(`❌ ${tc.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            // Ask LLM to summarize the results for the user
            const toolResultsSummary = toolResults.join("\n");
            const followUp = await this.retryLLM(() =>
                this.llm.chat([
                    systemPrompt,
                    ...this.chatHistory,
                    { role: "assistant", content: `ツールを実行した結果:\n${toolResultsSummary}` },
                    { role: "user", content: "重要ルール: ファイルパスを伝えるだけは禁止。コードの中身をメッセージに含めること。結果データがあればそれを直接見せること。ユーザーの依頼に対する回答をこのメッセージ内で完結させて。" },
                ])
            );

            const reply = followUp.content ?? toolResultsSummary;
            this.chatHistory.push({ role: "assistant", content: reply });
            this.userInstructionCount++;

            return {
                content: reply,
                toolCalls: response.toolCalls,
                usage: response.usage,
            };
        }

        const reply = response.content ?? "...";

        // 5. Save Response
        this.chatHistory.push({ role: "assistant", content: reply });

        // 6. Minimal Learning Hook
        this.userInstructionCount++;

        return {
            content: reply,
            toolCalls: response.toolCalls,
            usage: response.usage
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

        // Collect plugin prompt sections (M3: beforeDecide hook)
        const pluginSections: string[] = [];
        for (const p of this.plugins) {
            if (p.hooks.beforeDecide) {
                const sections = await p.hooks.beforeDecide(this.getPluginContext());
                pluginSections.push(...sections);
            }
        }

        // Build system message
        const systemMessage: ChatMessage = {
            role: "system",
            content: [
                "You are ZEN AI, a present-moment agent. You act based on the current gap between goal and state.",
                "If you create a web application or HTML file, use 'start_sandbox' to deploy it and share the URL with the user as a proof of work.",
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
                ...pluginSections,
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
        const response = await this.retryLLM<ChatResponse>(async () => {
            const res = await this.llm.chat(messages, {
                tools: toolDefs.length > 0 ? toolDefs : undefined,
            });

            // Track usage
            if (res.usage) {
                this.totalUsage.promptTokens += res.usage.promptTokens;
                this.totalUsage.completionTokens += res.usage.completionTokens;
                this.totalUsage.totalTokens += res.usage.totalTokens;
            }

            return res;
        });

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

            // Collect artifact from successful tool execution
            if (result.success) {
                const outputStr = typeof result.output === "string"
                    ? result.output
                    : JSON.stringify(result.output);

                // Extract file path if available
                let filePath: string | undefined;
                if (action.parameters && typeof action.parameters === "object") {
                    // Check for common file path parameters
                    const params = action.parameters as Record<string, unknown>;
                    if (typeof params.TargetFile === "string") filePath = params.TargetFile;
                    else if (typeof params.targetFile === "string") filePath = params.targetFile;
                    else if (typeof params.filePath === "string") filePath = params.filePath;
                    else if (typeof params.path === "string") filePath = params.path;
                }

                const artifact: Artifact = {
                    toolName: action.toolName,
                    description: action.reasoning ?? `${action.toolName} executed successfully`,
                    output: outputStr.length > 500 ? outputStr.slice(0, 500) + "..." : outputStr,
                    createdAt: new Date().toISOString(),
                    step: this.stepCount,
                    filePath,
                };
                this.artifacts.push(artifact);
                this.emit("artifact:created", artifact);
            }

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

            // Plugin: onEvolution
            for (const p of this.plugins) {
                if (p.hooks.onEvolution) {
                    try { await p.hooks.onEvolution(this.getPluginContext(), record); } catch { /* swallow */ }
                }
            }
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

    /** Build a PluginContext from the current agent state. */
    private getPluginContext(): PluginContext {
        return {
            goal: this.goal,
            snapshot: this.snapshot,
            delta: this.delta,
            selfModel: this.selfModel,
            stepCount: this.stepCount,
        };
    }

    /** Get the current self-model (for external inspection / testing). */
    getSelfModel(): Readonly<SelfModel> {
        return this.selfModel;
    }

    /**
     * Save SelfModel to disk (M2: Persistent Self-Model).
     * Enables growth across runs — the agent remembers what it learned.
     */
    saveSelfModel(): void {
        if (!this.selfModelPath) return;
        try {
            const dir = dirname(this.selfModelPath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(this.selfModelPath, JSON.stringify(this.selfModel, null, 2), "utf-8");
        } catch {
            // Silently fail — persistence is best-effort
        }
    }

    /**
     * Load SelfModel from disk (M2: Persistent Self-Model).
     * Restores previous learning when the agent starts a new run.
     */
    private loadSelfModel(): void {
        if (!this.selfModelPath) return;
        try {
            if (existsSync(this.selfModelPath)) {
                const raw = readFileSync(this.selfModelPath, "utf-8");
                const loaded = JSON.parse(raw) as Partial<SelfModel>;
                // Merge carefully — preserve structure, load data
                if (loaded.toolStats) this.selfModel.toolStats = loaded.toolStats;
                if (loaded.sufferingTrend) this.selfModel.sufferingTrend = loaded.sufferingTrend;
                if (loaded.evolutionLog) this.selfModel.evolutionLog = loaded.evolutionLog;
                if (loaded.activeStrategies) {
                    const s = loaded.activeStrategies;
                    this.selfModel.activeStrategies = {
                        toolPreferences: s.toolPreferences ?? {},
                        avoidPatterns: s.avoidPatterns ?? [],
                        approachHints: s.approachHints ?? [],
                    };
                }
            }
        } catch {
            // Silently fail — start fresh if file is corrupted
        }
    }
}
