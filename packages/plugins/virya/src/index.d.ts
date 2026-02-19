import type { ZenPlugin, Tool, LLMAdapter } from "@zen-ai/core";
/** Configuration for the Virya plugin. */
export interface ViryaConfig {
    /** LLM adapter for tool synthesis. */
    llm: LLMAdapter;
    /** Agent instance (for dynamic tool registration via addTool). */
    agent: {
        addTool(tool: Tool): void;
        getToolNames(): string[];
    };
    /** Directory to persist synthesized tool blueprints. */
    blueprintDir?: string;
    /** Maximum tools to synthesize per run. Default: 3. */
    maxSynthesesPerRun?: number;
    /** Minimum confidence threshold for synthesized tools. Default: 0.7. */
    minConfidence?: number;
    /** Timeout for synthesized tool execution in milliseconds. Default: 5000. */
    timeoutMs?: number;
}
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
export declare function createViryaPlugin(config: ViryaConfig): ZenPlugin;
//# sourceMappingURL=index.d.ts.map