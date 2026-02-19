// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-ksanti
// Circuit Breaker (Protection from cascading failures)
// ============================================================================
var CircuitState;
(function (CircuitState) {
    CircuitState[CircuitState["CLOSED"] = 0] = "CLOSED";
    CircuitState[CircuitState["OPEN"] = 1] = "OPEN";
    CircuitState[CircuitState["HALF_OPEN"] = 2] = "HALF_OPEN"; // Testing recovery
})(CircuitState || (CircuitState = {}));
export class CircuitBreaker {
    state = CircuitState.CLOSED;
    failureCount = 0;
    failureThreshold;
    resetTimeout;
    nextAttemptTime = 0;
    constructor(config = {}) {
        this.failureThreshold = config.failureThreshold ?? 5;
        this.resetTimeout = config.resetTimeout ?? 30000;
    }
    /** Check if execution is allowed. Throws if OPEN. */
    check() {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() > this.nextAttemptTime) {
                this.state = CircuitState.HALF_OPEN;
            }
            else {
                throw new Error(`CircuitBreaker is OPEN. Requests blocked until ${new Date(this.nextAttemptTime).toISOString()}`);
            }
        }
    }
    /** Report a success. Resets counters if recovering. */
    onSuccess() {
        if (this.state === CircuitState.HALF_OPEN) {
            this.state = CircuitState.CLOSED;
            this.failureCount = 0;
        }
        else if (this.state === CircuitState.CLOSED) {
            // Optional: Decaying failure count over time could be implemented here
            this.failureCount = 0;
        }
    }
    /** Report a failure. Trips circuit if threshold reached. */
    onFailure() {
        if (this.state === CircuitState.CLOSED) {
            this.failureCount++;
            if (this.failureCount >= this.failureThreshold) {
                this.trip();
            }
        }
        else if (this.state === CircuitState.HALF_OPEN) {
            this.trip();
        }
    }
    trip() {
        this.state = CircuitState.OPEN;
        this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
    getState() {
        return CircuitState[this.state];
    }
}
//# sourceMappingURL=circuit-breaker.js.map