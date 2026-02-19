import type { ZenPlugin } from "@zen-ai/core";
import { RetryConfig } from "./retry-strategy.js";
import { CircuitBreakerConfig } from "./circuit-breaker.js";
export interface KsantiConfig {
    retry?: RetryConfig;
    circuitBreaker?: CircuitBreakerConfig;
    /** If true, detailed resilience logs are added to context. Default: true. */
    verbose?: boolean;
}
export interface KsantiMetrics {
    errorsIntercepted: number;
    retriesAttempted: number;
    circuitsTripped: number;
}
export declare function createKsantiPlugin(config?: KsantiConfig): ZenPlugin;
//# sourceMappingURL=index.d.ts.map