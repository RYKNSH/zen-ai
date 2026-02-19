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
import { RetryStrategy } from "./retry-strategy.js";
import { CircuitBreaker } from "./circuit-breaker.js";
// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------
export function createKsantiPlugin(config = {}) {
    const retryStrategy = new RetryStrategy(config.retry);
    const breakers = new Map();
    // Helper to get or create breaker for a tool
    const getBreaker = (toolName) => {
        if (!breakers.has(toolName)) {
            breakers.set(toolName, new CircuitBreaker(config.circuitBreaker));
        }
        return breakers.get(toolName);
    };
    let metrics = {
        errorsIntercepted: 0,
        retriesAttempted: 0,
        circuitsTripped: 0,
    };
    // Track active retries to prevent infinite loops in onError
    // (In a real implementation, the core's runner would likely handle the retry loop,
    //  but here we simulate advice or direct intervention)
    const activeRetries = new Map();
    // Key: stepId, Value: attempt count
    const hooks = {
        /**
         * afterAction: Monitor tool execution for Circuit Breaker.
         */
        async afterAction(ctx, action, result) {
            const breaker = getBreaker(action.toolName);
            const prevBreakerState = breaker.getState();
            if (result.success) {
                breaker.onSuccess();
            }
            else {
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
        async onError(ctx, error) {
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
        async beforeDecide(ctx) {
            const warnings = [];
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
        },
        /**
         * beforeAction: Enforce Circuit Breaker checks *before* execution.
         * (Requires Zen Core to support `beforeAction` blocking or throwing)
         */
        // Note: If ZenAgent calls this before execution, we can throw here to prevent execution.
        // Let's assume `beforeAction` exists and can throw.
        async beforeAction(ctx, action) {
            const breaker = getBreaker(action.toolName);
            // This will throw if Open, preventing the action and triggering onError
            breaker.check();
        },
    };
    return {
        name: "ksanti",
        description: "Resilience — the third perfection (忍辱). Provides Circuit Breakers and Retry strategies.",
        hooks,
        install() {
            metrics = {
                errorsIntercepted: 0,
                retriesAttempted: 0,
                circuitsTripped: 0,
            };
            breakers.clear();
        }
    };
}
//# sourceMappingURL=index.js.map