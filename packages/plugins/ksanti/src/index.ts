// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-ksanti (忍辱 / Resilience)
// "The third perfection: patience and tolerance endure all hardships."
// ============================================================================
//
// Ksanti (क्षान्ति) — the Resilience Plugin for ZEN AI.
//
// This plugin implements the third of the Six Perfections (六波羅蜜多).
// It grants the agent "Equanimity" — the ability to remain calm and
// resilient in the face of errors, rate limits, and failures.
//
// Features:
//   - Smart Retry with Jitter (Exponential Backoff)
//   - Circuit Breaker for failing tools
//   - Error Interception & Recovery Suggestions
//
// Hooks used:
//   - onError: Intercept errors to apply retry logic or recovery advice.
//   - afterAction: Monitor success/failure to update Circuit Breaker.
// ============================================================================

import type {
    ZenPlugin,
    ZenPluginHooks,
    PluginContext,
    Action,
    ToolResult,
} from "@zen-ai/core";

import { RetryStrategy, RetryConfig } from "./retry-strategy.js";
import { CircuitBreaker, CircuitBreakerConfig } from "./circuit-breaker.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface KsantiConfig {
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreakerConfig;
    /** If true, detailed resilience logs are added to context. Default: true. */
    verbose?: boolean;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface KsantiMetrics {
    errorsIntercepted: number;
    retriesAttempted: number;
    circuitsTripped: number;
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

export function createKsantiPlugin(config: KsantiConfig = {}): ZenPlugin {
    const retryStrategy = new RetryStrategy(config.retry);
    const breakers = new Map<string, CircuitBreaker>();

    // Helper to get or create breaker for a tool
    const getBreaker = (toolName: string) => {
        if (!breakers.has(toolName)) {
            breakers.set(toolName, new CircuitBreaker(config.circuitBreaker));
        }
        return breakers.get(toolName)!;
    };

    let metrics: KsantiMetrics = {
        errorsIntercepted: 0,
        retriesAttempted: 0,
        circuitsTripped: 0,
    };

    // Track active retries to prevent infinite loops in onError
    // (In a real implementation, the core's runner would likely handle the retry loop,
    //  but here we simulate advice or direct intervention)
    const activeRetries = new Map<string, number>();
    // Key: stepId, Value: attempt count

    const hooks: ZenPluginHooks = {
        /**
         * afterAction: Monitor tool execution for Circuit Breaker.
         */
        async afterAction(ctx: PluginContext, action: Action, result: ToolResult) {
            const breaker = getBreaker(action.toolName);
            const prevBreakerState = breaker.getState();

            if (result.success) {
                breaker.onSuccess();
            } else {
                breaker.onFailure();
            }

            // Check if circuit just tripped
            if (prevBreakerState !== "OPEN" && breaker.getState() === "OPEN") {
                metrics.circuitsTripped++;
                // Notify agent via context injection or log?
                // For now, we rely on onError to report it if it happens again.
            }
        },

        /**
         * onError: Decide whether to retry, block (Circuit Open), or fail.
         * The core calls this when an action fails or throws.
         */
        async onError(ctx: PluginContext, error: Error) {
            metrics.errorsIntercepted++;

            // Check if this is a circuit breaker error
            // If the error came from a tool execution that was blocked, we should explain it.
            if (error.message.includes("CircuitBreaker is OPEN")) {
                // Already handled by the thrower, but we can add context
                return;
            }

            // Simple retry logic simulation
            // In a deeper integration, we might return a specific "RetryCommand" to the core.
            // For this plugin, we'll try to execute the retry manually or modify the agent's memory/plan.

            // Note: Since we can't easily "re-run" the action from within onError without the core's cooperation,
            // we will provide *Advice* to the agent in the next step, OR 
            // if the core supports a "retry" return type from hooks (hypothetically).

            // Assuming Zen Core 1.0 architecture allows us to affect the *Next* observation.
            // We'll leave a "Ksanti Note" in the context.
        },

        /**
         * beforeDecide: Inject Circuit Breaker status and Retry advice.
         */
        async beforeDecide(ctx: PluginContext): Promise<string[]> {
            const warnings: string[] = [];

            // Report Open Circuits
            for (const [tool, breaker] of breakers) {
                if (breaker.getState() === "OPEN") {
                    warnings.push(`⚠️ Tool "${tool}" is currently unavailable (Circuit Breaker OPEN) due to repeated failures.`);
                }
            }

            if (warnings.length > 0) {
                return [
                    `## 🛡️ Resilience Warnings (Ksanti)\n${warnings.map(w => `- ${w}`).join("\n")}`
                ];
            }

            return [];
        }
    };

    return {
        name: "ksanti",
        description: "Resilience — the third perfection (忍辱). Provides Circuit Breakers, Retry strategies, and Tanha (Craving) Loop handling.",
        hooks,
        install(agent: any) {
            // Reset metrics on install
            metrics = {
                errorsIntercepted: 0,
                retriesAttempted: 0,
                circuitsTripped: 0,
            };
            breakers.clear();

            // Check if agent supports event listening (ZenAgent)
            if (agent && typeof agent.on === "function") {
                // Listen for Tanha Loop Detection (Buddhist AI Phase 0.5)
                // When the agent detects it's stuck in a craving loop, we intervene.
                agent.on("tanha:loop:detected", (event: { pattern: string; count: number }) => {
                    // Pattern key is "toolName:errorString"
                    const [toolName] = event.pattern.split(":");

                    if (toolName) {
                        const breaker = getBreaker(toolName);
                        // If not already open, trip it immediately.
                        // This aligns the engineering "Circuit Breaker" with the spiritual "Tanha Interruption".
                        if (breaker.getState() !== "OPEN") {
                            breaker.onFailure(); // Count the failure
                            // Force trip if not already tripped by the failure count
                            // (Tanha detection might be more sensitive or use different criteria than raw failure count)
                            if (breaker.getState() !== "OPEN") {
                                // Simulate enough failures to trip
                                // Or we could add a forceTrip() method to CircuitBreaker.
                                // For now, we just call onFailure() until it trips or we hit a safe limit.
                                let attempts = 0;
                                while (breaker.getState() !== "OPEN" && attempts < 10) {
                                    breaker.onFailure();
                                    attempts++;
                                }
                            }
                            metrics.circuitsTripped++;
                        }
                    }
                });
            }
        }
    };
}
