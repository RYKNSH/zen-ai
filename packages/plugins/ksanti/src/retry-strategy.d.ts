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
export declare class RetryStrategy {
    private maxAttempts;
    private initialDelay;
    private multiplier;
    private maxDelay;
    private jitter;
    constructor(config?: RetryConfig);
    /**
     * Determine if an operation should be retried based on attempt count.
     * Returns the delay in ms, or null if no retry.
     */
    shouldRetry(attempt: number, error: unknown): number | null;
}
//# sourceMappingURL=retry-strategy.d.ts.map