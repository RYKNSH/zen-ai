// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-ksanti
// Circuit Breaker (Protection from cascading failures)
// ============================================================================

export interface CircuitBreakerConfig {
    /** Errors threshold to open the circuit. Default: 5. */
    failureThreshold?: number;
    /** Time in ms to keep the circuit open (reset timeout). Default: 30000. */
    resetTimeout?: number;
}

enum CircuitState {
    CLOSED,   // Normal operation
    OPEN,     // Failing, request blocked
    HALF_OPEN // Testing recovery
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private failureThreshold: number;
    private resetTimeout: number;
    private nextAttemptTime = 0;

    constructor(config: CircuitBreakerConfig = {}) {
        this.failureThreshold = config.failureThreshold ?? 5;
        this.resetTimeout = config.resetTimeout ?? 30000;
    }

    /** Check if execution is allowed. Throws if OPEN. */
    check(): void {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() > this.nextAttemptTime) {
                this.state = CircuitState.HALF_OPEN;
            } else {
                throw new Error(`CircuitBreaker is OPEN. Requests blocked until ${new Date(this.nextAttemptTime).toISOString()}`);
            }
        }
    }

    /** Report a success. Resets counters if recovering. */
    onSuccess(): void {
        if (this.state === CircuitState.HALF_OPEN) {
            this.state = CircuitState.CLOSED;
            this.failureCount = 0;
        } else if (this.state === CircuitState.CLOSED) {
            // Optional: Decaying failure count over time could be implemented here
            this.failureCount = 0;
        }
    }

    /** Report a failure. Trips circuit if threshold reached. */
    onFailure(): void {
        if (this.state === CircuitState.CLOSED) {
            this.failureCount++;
            if (this.failureCount >= this.failureThreshold) {
                this.trip();
            }
        } else if (this.state === CircuitState.HALF_OPEN) {
            this.trip();
        }
    }

    private trip(): void {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.resetTimeout;
    }

    getState(): string {
        return CircuitState[this.state];
    }
}
