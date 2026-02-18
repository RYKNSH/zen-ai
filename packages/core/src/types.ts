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
}
