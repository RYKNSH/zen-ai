import type { ZenPlugin, Delta } from "@zen-ai/core";
/** A single ethical rule the agent must follow. */
export interface EthicalRule {
    /** Unique rule identifier. */
    id: string;
    /** Human-readable description of the rule. */
    description: string;
    /**
     * Evaluator function: receives the current delta and returns
     * true if the action should be VETOED (i.e., it violates the rule).
     */
    evaluate: (delta: Delta) => boolean | Promise<boolean>;
    /** Severity of the rule violation. */
    severity: "critical" | "warning" | "info";
}
/** Configuration for the Sila plugin. */
export interface SilaConfig {
    /** Ethical rules to enforce. */
    rules: EthicalRule[];
    /** Maximum number of vetoes before the agent should stop entirely. Default: 5. */
    maxVetoes?: number;
    /** Custom ethical guidelines to inject into the LLM prompt. */
    guidelines?: string[];
}
/** Metrics tracked by the Sila plugin. */
export interface SilaMetrics {
    /** Total number of actions vetoed. */
    totalVetoes: number;
    /** Vetoes per rule ID. */
    vetoesPerRule: Record<string, number>;
    /** Total actions allowed. */
    totalAllowed: number;
    /** Compliance rate (0-1). */
    complianceRate: number;
}
/**
 * Create a Sila (Ethics) plugin.
 *
 * Usage:
 * ```ts
 * const agent = new ZenAgent({ ... });
 * await agent.use(createSilaPlugin({
 *     rules: [
 *         {
 *             id: "no-destructive-actions",
 *             description: "Never delete production data",
 *             evaluate: (delta) => delta.description.includes("delete production"),
 *             severity: "critical",
 *         },
 *     ],
 *     guidelines: [
 *         "Always prefer non-destructive approaches",
 *         "Seek confirmation before irreversible actions",
 *     ],
 * }));
 * ```
 */
export declare function createSilaPlugin(config: SilaConfig): ZenPlugin;
/**
 * Create a Sila plugin with external metrics access.
 * Returns both the plugin and a function to retrieve current metrics.
 */
export declare function createSilaPluginWithMetrics(config: SilaConfig): {
    plugin: ZenPlugin;
    getMetrics: () => SilaMetrics;
};
export declare const DEFAULT_RULES: EthicalRule[];
//# sourceMappingURL=index.d.ts.map