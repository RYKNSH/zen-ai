export interface CircuitBreakerConfig {
    /** Errors threshold to open the circuit. Default: 5. */
    failureThreshold?: number;
    /** Time in ms to keep the circuit open (reset timeout). Default: 30000. */
    resetTimeout?: number;
}
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private failureThreshold;
    private resetTimeout;
    private nextAttemptTime;
    constructor(config?: CircuitBreakerConfig);
    /** Check if execution is allowed. Throws if OPEN. */
    check(): void;
    /** Report a success. Resets counters if recovering. */
    onSuccess(): void;
    /** Report a failure. Trips circuit if threshold reached. */
    onFailure(): void;
    private trip;
    getState(): string;
}
//# sourceMappingURL=circuit-breaker.d.ts.map