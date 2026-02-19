// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-ksanti
// Retry Strategy (Exponential Backoff + Jitter)
// ============================================================================

export interface RetryConfig {
    /** Maximum number of retry attempts. Default: 3. */
    maxAttempts?: number;
    /** Initial delay in ms. Default: 1000. */
    initialDelay?: number;
    /** Multiplier for exponential backoff. Default: 2. */
    backoffMultiplier?: number;
    /** Maximum delay in ms. Default: 10000. */
    maxDelay?: number;
    /** Jitter factor (0-1). Default: 0.1. */
    jitter?: number;
}

export class RetryStrategy {
    private maxAttempts: number;
    private initialDelay: number;
    private multiplier: number;
    private maxDelay: number;
    private jitter: number;

    constructor(config: RetryConfig = {}) {
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
    shouldRetry(attempt: number, error: unknown): number | null {
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
