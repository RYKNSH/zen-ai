// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-ksanti
// Retry Strategy (Exponential Backoff + Jitter)
// ============================================================================
export class RetryStrategy {
    maxAttempts;
    initialDelay;
    multiplier;
    maxDelay;
    jitter;
    constructor(config = {}) {
        this.maxAttempts = config.maxAttempts ?? 3;
        this.initialDelay = config.initialDelay ?? 1000;
        this.multiplier = config.backoffMultiplier ?? 2;
        this.maxDelay = config.maxDelay ?? 10000;
        this.jitter = config.jitter ?? 0.1;
    }
    /**
     * Determine if an operation should be retried based on attempt count.
     * Returns the delay in ms, or null if no retry.
     */
    shouldRetry(attempt, error) {
        // TODO: Filter errors? For now, retry all except specific fatal ones?
        // Assuming all errors are retriable for generic tool execution unless specified.
        if (attempt >= this.maxAttempts) {
            return null;
        }
        // Calculate delay: initial * (multiplier ^ attempt)
        let delay = this.initialDelay * Math.pow(this.multiplier, attempt);
        // Cap at max delay
        delay = Math.min(delay, this.maxDelay);
        // Add jitter: delay * (1 ± jitter)
        const jitterAmount = delay * this.jitter;
        const jitterOffset = (Math.random() * 2 - 1) * jitterAmount; // -jitter to +jitter
        return Math.floor(delay + jitterOffset);
    }
}
//# sourceMappingURL=retry-strategy.js.map