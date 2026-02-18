// ============================================================================
// ZEN AI SDK — Core Type Definitions
// "Don't accumulate. Perceive now."
// ============================================================================

// ---------------------------------------------------------------------------
// Goal — The North Star (never changes during a run)
// ---------------------------------------------------------------------------

/** The immutable objective that drives the agent. */
export interface Goal {
    /** Human-readable description of the goal. */
    description: string;
    /** Optional structured criteria for completion. */
    successCriteria?: string[];
}

// ---------------------------------------------------------------------------
// Snapshot — The present moment
// ---------------------------------------------------------------------------

/** A point-in-time capture of the agent's environment. */
export type Snapshot = Record<string, unknown>;

/** User-provided function that captures the current state. */
export type SnapshotFn = () => Promise<Snapshot> | Snapshot;

/**
 * L1: MindfulObserver output — bias-filtered observation with metadata.
 * Based on the Four Foundations of Mindfulness (四念処).
 */
export interface Observation {
    /** Raw snapshot data (backward-compatible). */
    data: Snapshot;
    /** Bias score: 0 = no bias, 1 = high bias (confirmation bias, craving filter). */
    biasScore: number;
    /** Mindfulness level: 0 = distracted, 1 = fully present. */
    mindfulnessLevel: number;
    /** Timestamp of observation. */
    observedAt: Date;
}

// ---------------------------------------------------------------------------
// Delta — The gap between Goal and Snapshot
// ---------------------------------------------------------------------------

/** The computed difference between the goal and the current snapshot. */
export interface Delta {
    /** Human-readable summary of what's missing. */
    description: string;
    /** Numeric progress indicator (0.0 → 1.0). */
    progress: number;
    /** Key areas that still need work. */
    gaps: string[];
    /** Whether the goal appears to be fully satisfied. */
    isComplete: boolean;

    // --- Buddhist AI Metrics (L3: DukkhaEvaluator) ---

    /** Suffering delta: < 0 means suffering decreased (good), > 0 means increased. */
    sufferingDelta?: number;
    /** Ego noise: 0 = no self-preservation bias, 1 = high self-bias. */
    egoNoise?: number;
}

// ---------------------------------------------------------------------------
// Actions & Tools
// ---------------------------------------------------------------------------

/** JSON Schema subset for tool parameter definitions. */
export interface ParameterSchema {
    type: string;
    properties?: Record<string, { type: string; description: string }>;
    required?: string[];
}

/** A capability the agent can invoke. */
export interface Tool {
    /** Unique name for this tool. */
    name: string;
    /** Human-readable description (fed to LLM for selection). */
    description: string;
    /** JSON Schema defining the tool's parameters. */
    parameters: ParameterSchema;
    /** Execute the tool with the given parameters. */
    execute(params: Record<string, unknown>): Promise<ToolResult>;
}

/** The result of a tool execution. */
export interface ToolResult {
    /** Whether the tool call succeeded. */
    success: boolean;
    /** Output data from the tool. */
    output: unknown;
    /** Error message if the tool call failed. */
    error?: string;
}

/** An action the agent has decided to take. */
export interface Action {
    /** The tool to invoke. */
    toolName: string;
    /** Parameters to pass to the tool. */
    parameters: Record<string, unknown>;
    /** LLM's reasoning for choosing this action. */
    reasoning?: string;
    /** Tool call ID from the LLM (used for chat history). */
    toolCallId?: string;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/** A waypoint in the agent's journey toward the goal. */
export interface Milestone {
    /** Unique identifier. */
    id: string;
    /** Human-readable description of this waypoint. */
    description: string;
    /** Resources that must exist when this milestone is reached. */
    resources: string[];
}

/** Status of a single milestone. */
export interface MilestoneStatus {
    milestone: Milestone;
    reached: boolean;
    reachedAt?: Date;
}

// ---------------------------------------------------------------------------
// LLM Adapter
// ---------------------------------------------------------------------------

/** A message in a chat conversation. */
export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    /** Tool call ID (for tool role messages). */
    toolCallId?: string;
    /** Tool calls made by the assistant (for assistant role messages). */
    toolCalls?: LLMToolCall[];
}

/** A tool call requested by the LLM. */
export interface LLMToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

/** Response from a chat completion that may include tool calls. */
export interface ChatResponse {
    content: string | null;
    toolCalls?: LLMToolCall[];
}

/** Tool definition in the format expected by the LLM. */
export interface LLMToolDefinition {
    name: string;
    description: string;
    parameters: ParameterSchema;
}

/**
 * Pluggable interface for any LLM provider.
 * Implement this to use ZEN AI with your preferred model.
 */
export interface LLMAdapter {
    /** Generate a text completion. */
    complete(prompt: string): Promise<string>;
    /** Generate an embedding vector. */
    embed(text: string): Promise<number[]>;
    /** Chat completion with optional tool/function calling. */
    chat(
        messages: ChatMessage[],
        options?: { tools?: LLMToolDefinition[] },
    ): Promise<ChatResponse>;
}

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

/** Configuration for creating a ZenAgent. */
export interface ZenAgentConfig {
    /** The agent's immutable goal. */
    goal: string | Goal;
    /** The LLM adapter to use. */
    llm: LLMAdapter;
    /** Ordered list of milestones (optional but recommended). */
    milestones?: Milestone[];
    /** Function that captures the current environment state. */
    snapshot?: SnapshotFn;
    /** Tools the agent can use. */
    tools?: Tool[];
    /** Maximum number of steps before automatic stop. Default: 100. */
    maxSteps?: number;
    /** Maximum retries per LLM call. Default: 3. */
    maxRetries?: number;
    /** SkillDB instance (optional). */
    skillDB?: SkillDB;
    /** FailureKnowledgeDB instance (optional). */
    failureDB?: FailureDB;
    /** KarmaMemoryDB instance (optional, Phase 1.5+). */
    karmaMemoryDB?: KarmaMemoryDB;
    /** Path to persist the self-model JSON (enables growth across runs). */
    selfModelPath?: string;
}

// ---------------------------------------------------------------------------
// Memory interfaces (implemented in @zen-ai/memory)
// ---------------------------------------------------------------------------

/** A stored skill entry. */
export interface SkillEntry {
    id: string;
    trigger: string;
    command: string;
    condition: string;
    embedding?: number[];
}

/** A stored failure knowledge entry. */
export interface FailureEntry {
    id: string;
    proverb: string;
    condition: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    source: string;
    embedding?: number[];
}

/** Retrieval-based skill database interface. */
export interface SkillDB {
    store(entry: Omit<SkillEntry, "embedding">): Promise<void>;
    retrieve(query: string, topK?: number): Promise<SkillEntry[]>;
    list(): Promise<SkillEntry[]>;
}

/** Retrieval-based failure knowledge database interface. */
export interface FailureDB {
    store(entry: Omit<FailureEntry, "embedding">): Promise<void>;
    retrieve(query: string, topK?: number): Promise<FailureEntry[]>;
    list(): Promise<FailureEntry[]>;
    exportCurrent(): FailureEntry[];
}

// ---------------------------------------------------------------------------
// Karma Memory (Phase 1: Buddhist AI)
// ---------------------------------------------------------------------------

/** Types of karmic causation. */
export type KarmaType = "skillful" | "unskillful" | "neutral";

/**
 * A karma entry — failure knowledge enhanced with causal chain tracking.
 * Extends FailureEntry with Buddhist AI concepts for long-term wisdom.
 */
export interface KarmaEntry extends FailureEntry {
    /** Chain of cause-and-effect IDs leading to this karma. */
    causalChain: string[];
    /** Transfer weight: how applicable this karma is to new contexts (0-1). */
    transferWeight: number;
    /** Type of karma: skillful (good), unskillful (bad), or neutral. */
    karmaType: KarmaType;
    /** Number of times this pattern has been observed. */
    occurrences: number;
    /** Timestamp of last observation. */
    lastSeen: string;
}

/** Interface for karma memory — long-term causal wisdom store. */
export interface KarmaMemoryDB {
    /** Store a karma entry with causal chain. */
    store(entry: Omit<KarmaEntry, "embedding">): Promise<void>;
    /** Retrieve karma by semantic similarity. */
    retrieve(query: string, topK?: number): Promise<KarmaEntry[]>;
    /** List all karma entries. */
    list(): Promise<KarmaEntry[]>;
    /** Find karma entries that form a causal chain for the given entry ID. */
    traceCausalChain(entryId: string): Promise<KarmaEntry[]>;
    /** Get entries that have been seen repeatedly (habitual patterns). */
    getHabitualPatterns(minOccurrences?: number): Promise<KarmaEntry[]>;
    /** Decay transfer weights over time (impermanence / 無常). */
    applyImpermanence(decayRate?: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Causal Graph (Phase 2: Buddhist AI)
// ---------------------------------------------------------------------------

/** A causal link between two events/actions. */
export interface CausalLink {
    /** ID of the cause event. */
    causeId: string;
    /** ID of the effect event. */
    effectId: string;
    /** Strength of the causal relationship (0-1). */
    strength: number;
    /** LLM-inferred reasoning for the causal link. */
    reasoning: string;
}

// ---------------------------------------------------------------------------
// Seven Factors of Awakening (Phase 3: Buddhist AI)
// ---------------------------------------------------------------------------

/** The seven stages of the awakening decision pipeline. */
export type AwakeningStage =
    | "investigation"  // 択法: hypothesis generation
    | "mindfulness"    // 念: bias removal
    | "energy"         // 精進: effort calibration
    | "joy"            // 喜: intrinsic reward check
    | "tranquility"    // 軽安: regularization
    | "concentration"  // 定: causal focus
    | "equanimity";    // 捨: letting go of outcome attachment

/** Result of one stage in the seven-factor pipeline. */
export interface AwakeningStageResult {
    stage: AwakeningStage;
    output: string;
    confidence: number;
    filtered: boolean;  // Whether this stage filtered out the previous output
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** All events emitted by the ZenAgent. */
export interface ZenAgentEvents {
    "milestone:reached": {
        milestoneId: string;
        resources: string[];
    };
    "milestone:failed": {
        milestoneId: string;
        error: Error;
    };
    "action:start": {
        action: Action;
        step: number;
    };
    "action:complete": {
        action: Action;
        result: ToolResult;
        step: number;
    };
    "context:reset": {
        previousMilestone: string;
        nextMilestone: string | null;
    };
    "failure:recorded": {
        proverb: string;
        condition: string;
    };
    "skill:acquired": {
        skillId: string;
    };
    "agent:start": {
        goal: Goal;
    };
    "agent:complete": {
        goal: Goal;
        totalSteps: number;
    };
    "agent:error": {
        error: Error;
        step: number;
    };

    // --- Buddhist AI Events (Phase 0.5) ---

    /** Emitted when an observation is captured with mindfulness metadata. */
    "observation:captured": {
        biasScore: number;
        mindfulnessLevel: number;
    };
    /** Emitted when suffering metrics are computed. */
    "dukkha:evaluated": {
        sufferingDelta: number;
        egoNoise: number;
    };

    // --- Buddhist AI Events (Phase 1.5) ---

    /** Emitted when karma is stored from a failure. */
    "karma:stored": {
        karmaId: string;
        karmaType: KarmaType;
        causalChain: string[];
    };

    // --- Buddhist AI Events (Phase 2) ---

    /** Emitted when causal analysis is performed. */
    "causal:analyzed": {
        links: CausalLink[];
    };

    // --- Buddhist AI Events (Phase 3) ---

    /** Emitted when an awakening stage is completed during decide(). */
    "awakening:stage": AwakeningStageResult;

    // --- Buddhist AI Events (Phase 0.5 — Tanha) ---

    /** Emitted when a Tanha (craving) loop is detected. */
    "tanha:loop:detected": {
        pattern: string;
        count: number;
    };

    // --- Buddhist AI Events (Phase 4 — Anatta) ---

    /** Emitted when the agent evolves its own behavior. */
    "anatta:evolved": SelfEvolutionRecord;

    // --- Plugin Events (M3) ---

    /** Emitted when a plugin vetoes an action. */
    "plugin:veto": {
        plugin: string;
        reason: string;
    };
}

// ---------------------------------------------------------------------------
// Agent State (for serialization / recovery)
// ---------------------------------------------------------------------------

/** Serializable agent state for crash recovery. */
export interface AgentState {
    goal: Goal;
    currentMilestoneIndex: number;
    stepCount: number;
    snapshot: Snapshot;
    delta: Delta | null;
    failures: FailureEntry[];
    startedAt: string;
    lastUpdatedAt: string;
    /** Buddhist AI suffering metrics (Phase 0.5+). */
    buddhistMetrics?: {
        /** Current suffering delta (higher = more suffering). */
        sufferingDelta?: number;
        /** Current ego noise level (0-1). */
        egoNoise?: number;
        /** Whether a Tanha (craving) loop has been detected. */
        tanhaLoopDetected: boolean;
        /** Number of karma entries stored. */
        karmaCount: number;
        /** Proxy metric for suffering: number of user instructions (corrections). */
        userInstructionCount: number;
    };
}

// ============================================================================
// Phase 4: AnattaSelfEvolver (無我・自己進化)
// ============================================================================

/** Active strategies — the "live" output of self-evolution, consumed by decide(). */
export interface ActiveStrategies {
    /** Tool preference weights: higher = prefer this tool (0-1). */
    toolPreferences: Record<string, number>;
    /** Patterns to avoid (injected into LLM prompt as warnings). */
    avoidPatterns: string[];
    /** Approach hints (injected into LLM prompt as guidance). */
    approachHints: string[];
}

/** Self-model: agent's understanding of its own behavior patterns. */
export interface SelfModel {
    /** Per-tool usage statistics. */
    toolStats: Record<string, {
        uses: number;
        successes: number;
        failures: number;
        avgSufferingDelta: number;
    }>;
    /** Rolling suffering trend (last N steps). */
    sufferingTrend: number[];
    /** Evolution history — what the agent has changed about itself. */
    evolutionLog: SelfEvolutionRecord[];
    /**
     * Active strategies — THE closed-loop learning output.
     * evolveIfNeeded() writes here; decide() reads from here.
     */
    activeStrategies: ActiveStrategies;
}

/** A record of a self-evolution event. */
export interface SelfEvolutionRecord {
    /** Timestamp of the evolution. */
    timestamp: string;
    /** What was changed. */
    change: string;
    /** Reason for the change. */
    reason: string;
    /** Type of evolution. */
    type: "tool_preference" | "approach_shift" | "milestone_reorder" | "strategy_change";
}

/** A proposal for self-evolution. */
export interface SelfEvolutionProposal {
    /** Description of what to change. */
    change: string;
    /** Reason inferred from current self-model. */
    reason: string;
    /** Type of change. */
    type: SelfEvolutionRecord["type"];
    /** Confidence in this proposal (0-1). */
    confidence: number;
}

// ============================================================================
// Plugin System (六波羅蜜多 SDK Layers)
// ============================================================================

/** Context passed to plugin hooks — provides read access to agent state. */
export interface PluginContext {
    /** The agent's goal. */
    goal: Goal;
    /** Current snapshot. */
    snapshot: Snapshot;
    /** Current delta (null before first computation). */
    delta: Delta | null;
    /** Current self-model (read-only). */
    selfModel: Readonly<SelfModel>;
    /** Current step count. */
    stepCount: number;
}

/** Lifecycle hooks available to plugins. All hooks are optional. */
export interface ZenPluginHooks {
    /**
     * Called before each observation (snapshot capture).
     * Can modify or enrich the context before observation.
     */
    beforeObserve?(ctx: PluginContext): void | Promise<void>;

    /**
     * Called after delta computation and before decide().
     * Can veto an action by returning `{ vetoed: true, reason: string }`.
     */
    afterDelta?(ctx: PluginContext, delta: Delta): void | { vetoed: true; reason: string } | Promise<void | { vetoed: true; reason: string }>;

    /**
     * Called before the LLM decision, can inject additional prompt sections.
     * Return an array of strings to append to the system prompt.
     */
    beforeDecide?(ctx: PluginContext): string[] | Promise<string[]>;

    /**
     * Called after a tool is executed with its result.
     * Can record metrics, trigger side effects, etc.
     */
    afterAction?(ctx: PluginContext, action: Action, result: ToolResult): void | Promise<void>;

    /**
     * Called when self-evolution occurs.
     */
    onEvolution?(ctx: PluginContext, record: SelfEvolutionRecord): void | Promise<void>;

    /**
     * Called when an error occurs during the run loop.
     */
    onError?(ctx: PluginContext, error: Error): void | Promise<void>;
}

/**
 * ZenPlugin — the extension point for the Six Perfections (六波羅蜜多).
 *
 * Each SDK layer (ethics, resilience, focus, self-learning, wisdom, knowledge-share)
 * implements this interface to hook into the agent's lifecycle.
 */
export interface ZenPlugin {
    /** Unique plugin name (e.g., "sila", "prajna", "dana"). */
    name: string;
    /** Human-readable description. */
    description?: string;
    /** Lifecycle hooks. */
    hooks: ZenPluginHooks;
    /** Optional: called once when plugin is registered via .use(). */
    install?(agent: unknown): void | Promise<void>;
}

// ============================================================================
// Dana Protocol (布施 — Knowledge Sharing Between Agents)
// ============================================================================

/** A unit of knowledge that can be shared between agents. */
export interface KnowledgeGift {
    /** Unique gift identifier. */
    id: string;
    /** Type of knowledge being shared. */
    type: "strategy" | "warning" | "skill" | "insight";
    /** Human-readable description. */
    description: string;
    /** The knowledge payload (JSON-serializable). */
    payload: Record<string, unknown>;
    /** Confidence in this knowledge (0-1). */
    confidence: number;
    /** Context in which this knowledge was learned. */
    sourceContext: string;
}

/**
 * KnowledgePacket — A bundle of knowledge from one agent to another.
 *
 * This is the atomic unit of the Dana (布施) protocol.
 * It encapsulates everything an agent has learned that could benefit another.
 */
export interface KnowledgePacket {
    /** Packet version for forward-compatibility. */
    version: 1;
    /** ID of the source agent. */
    sourceAgentId: string;
    /** Timestamp of packet creation. */
    createdAt: string;
    /** Knowledge gifts in this packet. */
    gifts: KnowledgeGift[];
    /** Source agent's active strategies at time of export. */
    strategies: ActiveStrategies;
    /** Summary of source agent's evolution history. */
    evolutionSummary: string[];
}

/**
 * DanaProtocol — Interface for knowledge exchange transport.
 *
 * Implementations can use file system, network, or shared memory.
 */
export interface DanaProtocol {
    /** Export knowledge from this agent. */
    exportPacket(agent: { getSelfModel(): Readonly<SelfModel>; goal: Goal }): KnowledgePacket;
    /** Import knowledge from another agent's packet. */
    importPacket(packet: KnowledgePacket): KnowledgeGift[];
    /** Merge imported knowledge into agent's active strategies. */
    mergeStrategies(current: ActiveStrategies, incoming: ActiveStrategies): ActiveStrategies;
}
