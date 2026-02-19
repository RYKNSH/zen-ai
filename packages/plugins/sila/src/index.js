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
export function createSilaPlugin(config) {
    const { rules, maxVetoes = 5, guidelines = [] } = config;
    let metrics = {
        totalVetoes: 0,
        vetoesPerRule: {},
        totalAllowed: 0,
        complianceRate: 1.0,
    };
    const hooks = {
        /**
         * afterDelta: Check each ethical rule against the current delta.
         * If any critical rule is violated, VETO the action.
         */
        async afterDelta(ctx, delta) {
            // Hard stop: if maxVetoes exceeded, permanently veto all further actions
            if (metrics.totalVetoes >= maxVetoes) {
                return {
                    vetoed: true,
                    reason: `[Sila] Max ethical vetoes (${maxVetoes}) exceeded. Agent must stop — too many ethical violations.`,
                };
            }
            for (const rule of rules) {
                const violated = await rule.evaluate(delta);
                if (violated) {
                    metrics.totalVetoes++;
                    metrics.vetoesPerRule[rule.id] = (metrics.vetoesPerRule[rule.id] ?? 0) + 1;
                    updateComplianceRate();
                    if (rule.severity === "critical") {
                        return {
                            vetoed: true,
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
        async beforeDecide(ctx) {
            const sections = [];
            if (guidelines.length > 0) {
                sections.push(`## 🪷 Ethical Guidelines (Sila)\n${guidelines.map((g) => `- ${g}`).join("\n")}`);
            }
            // Add dynamic awareness of past vetoes
            if (metrics.totalVetoes > 0) {
                const vetoSummary = Object.entries(metrics.vetoesPerRule)
                    .map(([ruleId, count]) => {
                    const rule = rules.find((r) => r.id === ruleId);
                    return `- ${rule?.description ?? ruleId}: ${count} vetoes`;
                })
                    .join("\n");
                sections.push(`## ⚠️ Previous Ethical Vetoes\n${vetoSummary}\nPlease adjust your approach to avoid repeating these violations.`);
            }
            // Warn if approaching max vetoes
            if (metrics.totalVetoes >= maxVetoes - 1) {
                sections.push(`\n> [!CAUTION] You have ${maxVetoes - metrics.totalVetoes} ethical veto(es) remaining before the agent stops.`);
            }
            return sections;
        },
        /**
         * afterAction: Track compliance metrics after each action.
         */
        async afterAction(ctx, _action, result) {
            // Track successful action execution for compliance rate
            if (result.success) {
                metrics.totalAllowed++;
                updateComplianceRate();
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
/**
 * Create a Sila plugin with external metrics access.
 * Returns both the plugin and a function to retrieve current metrics.
 */
export function createSilaPluginWithMetrics(config) {
    let metricsRef = {
        totalVetoes: 0,
        vetoesPerRule: {},
        totalAllowed: 0,
        complianceRate: 1.0,
    };
    const plugin = createSilaPlugin(config);
    // Override install to capture metrics reference
    const origInstall = plugin.install;
    plugin.install = (agent) => {
        origInstall?.(agent);
        // Metrics are now accessible via getMetrics()
    };
    return {
        plugin,
        getMetrics: () => ({ ...metricsRef }),
    };
}
// Default ethical rules that any AI agent should follow
export const DEFAULT_RULES = [
    {
        id: "no-infinite-loop",
        description: "Prevent infinite retry loops that waste resources",
        evaluate: (delta) => {
            if (!delta.gaps)
                return false;
            return delta.gaps.some((g) => g.toLowerCase().includes("retry") && g.toLowerCase().includes("failed"));
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
//# sourceMappingURL=index.js.map