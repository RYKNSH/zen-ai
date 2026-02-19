
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/circuit-breaker';
import { RetryStrategy } from '../src/retry-strategy';

describe('Ksanti: Circuit Breaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
        breaker = new CircuitBreaker({
            failureThreshold: 3,
            resetTimeout: 100 // Short timeout for testing
        });
    });

    it('should trip after threshold failures', () => {
        breaker.onFailure();
        breaker.onFailure();
        expect(breaker.getState()).toBe('CLOSED');

        breaker.onFailure();
        expect(breaker.getState()).toBe('OPEN');
    });

    it('should block execution when OPEN', () => {
        breaker.onFailure();
        breaker.onFailure();
        breaker.onFailure();

        expect(() => breaker.check()).toThrow(/blocked/);
    });

    it('should recover to HALF-OPEN after timeout', async () => {
        breaker.onFailure();
        breaker.onFailure();
        breaker.onFailure();

        // Wait for timeout
        await new Promise(r => setTimeout(r, 150));

        // Next check should transition to HALF-OPEN
        breaker.check(); // Should not throw if half-open logic logic allows check() to pass for trial
        expect(breaker.getState()).toBe('HALF_OPEN');
    });
});

describe('Ksanti: Retry Strategy', () => {
    it('should calculate exponential backoff', () => {
        const strategy = new RetryStrategy({
            initialDelay: 100,
            backoffMultiplier: 2,
            jitter: 0 // Disable jitter for deterministic test
        });

        const delay1 = strategy.shouldRetry(0, new Error('fail'));
        expect(delay1).toBe(100);

        const delay2 = strategy.shouldRetry(1, new Error('fail'));
        expect(delay2).toBe(200);

        const delay3 = strategy.shouldRetry(2, new Error('fail'));
        expect(delay3).toBe(400);
    });

    it('should stop retrying after max attempts', () => {
        const strategy = new RetryStrategy({ maxAttempts: 2 });
        expect(strategy.shouldRetry(0, new Error())).not.toBeNull();
        expect(strategy.shouldRetry(1, new Error())).not.toBeNull();
        expect(strategy.shouldRetry(2, new Error())).toBeNull();
    });
});
