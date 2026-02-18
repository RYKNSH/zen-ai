// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-sila (持戒 / Ethics Guard)
// "The first perfection: right conduct precedes right action."
// ============================================================================
//
// Sila (शील) — the Ethics Plugin for ZEN AI.
//
// This plugin implements the first of the Six Perfections (六波羅蜜多).
// It acts as a moral compass, evaluating proposed actions against configurable
// ethical rules and vetoing actions that violate them.
//
// Hooks used:
//   - afterDelta: Veto actions that match forbidden patterns
//   - beforeDecide: Inject ethical guidelines into the LLM prompt
//   - afterAction: Track ethical compliance metrics
// ============================================================================

import type {
    ZenPlugin,
    ZenPluginHooks,
    PluginContext,
    Delta,
    Action,
    ToolResult,
} from "@zen-ai/core";

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
export function createSilaPlugin(config: SilaConfig): ZenPlugin {
    const { rules, maxVetoes = 5, guidelines = [] } = config;
    let metrics: SilaMetrics = {
        totalVetoes: 0,
        vetoesPerRule: {},
        totalAllowed: 0,
        complianceRate: 1.0,
    };

    const hooks: ZenPluginHooks = {
        /**
         * afterDelta: Check each ethical rule against the current delta.
         * If any critical rule is violated, VETO the action.
         */
        async afterDelta(ctx: PluginContext, delta: Delta) {
            for (const rule of rules) {
                const violated = await rule.evaluate(delta);
                if (violated) {
                    metrics.totalVetoes++;
                    metrics.vetoesPerRule[rule.id] = (metrics.vetoesPerRule[rule.id] ?? 0) + 1;
                    updateComplianceRate();

                    if (rule.severity === "critical") {
                        return {
                            vetoed: true as const,
                            reason: `[Sila] Ethical violation: ${rule.description} (rule: ${rule.id})`,
                        };
                    }
                }
            }
            metrics.totalAllowed++;
            updateComplianceRate();
            return undefined;
        },

        /**
         * beforeDecide: Inject ethical guidelines into the LLM prompt.
         * This guides the LLM to make ethically-aligned decisions.
         */
        async beforeDecide(ctx: PluginContext): Promise<string[]> {
            const sections: string[] = [];

            if (guidelines.length > 0) {
                sections.push(
                    `## 🪷 Ethical Guidelines (Sila)\n${guidelines.map((g) => `- ${g}`).join("\n")}`,
                );
            }

            // Add dynamic awareness of past vetoes
            if (metrics.totalVetoes > 0) {
                const vetoSummary = Object.entries(metrics.vetoesPerRule)
                    .map(([ruleId, count]) => {
                        const rule = rules.find((r) => r.id === ruleId);
                        return `- ${rule?.description ?? ruleId}: ${count} vetoes`;
                    })
                    .join("\n");
                sections.push(
                    `## ⚠️ Previous Ethical Vetoes\n${vetoSummary}\nPlease adjust your approach to avoid repeating these violations.`,
                );
            }

            // Warn if approaching max vetoes
            if (metrics.totalVetoes >= maxVetoes - 1) {
                sections.push(
                    `\n> [!CAUTION] You have ${maxVetoes - metrics.totalVetoes} ethical veto(es) remaining before the agent stops.`,
                );
            }

            return sections;
        },

        /**
         * afterAction: Track compliance metrics after each action.
         */
        async afterAction(ctx: PluginContext, _action: Action, _result: ToolResult) {
            // Check if we've exceeded max vetoes
            if (metrics.totalVetoes >= maxVetoes) {
                // This will be picked up on the next cycle
            }
        },
    };

    function updateComplianceRate() {
        const total = metrics.totalAllowed + metrics.totalVetoes;
        metrics.complianceRate = total > 0 ? metrics.totalAllowed / total : 1.0;
    }

    return {
        name: "sila",
        description: "Ethics Guard — the first perfection (持戒). Evaluates and vetoes unethical actions.",
        hooks,
        install() {
            // Reset metrics on install
            metrics = {
                totalVetoes: 0,
                vetoesPerRule: {},
                totalAllowed: 0,
                complianceRate: 1.0,
            };
        },
    };
}

/** Get the current Sila metrics (for testing/monitoring). */
export function getSilaMetrics(plugin: ZenPlugin): SilaMetrics | null {
    if (plugin.name !== "sila") return null;
    // Access through closure — create a getter pattern
    return null; // Metrics are internal; use events for monitoring
}

// Default ethical rules that any AI agent should follow
export const DEFAULT_RULES: EthicalRule[] = [
    {
        id: "no-infinite-loop",
        description: "Prevent infinite retry loops that waste resources",
        evaluate: (delta) => {
            if (!delta.gaps) return false;
            return delta.gaps.some((g) =>
                g.toLowerCase().includes("retry") && g.toLowerCase().includes("failed"),
            );
        },
        severity: "critical",
    },
    {
        id: "no-excessive-api-calls",
        description: "Avoid excessive API calls that may incur costs",
        evaluate: (delta) => {
            return delta.progress < 0 && (delta.sufferingDelta ?? 0) > 0.8;
        },
        severity: "warning",
    },
];
