import { CircuitBreaker } from '../packages/plugins/ksanti/src/circuit-breaker.js';
console.log('🛡️ Testing Circuit Breaker...');
const breaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 2000
});
console.log(`Initial State: ${breaker.getState()}`); // CLOSED
// Simulate failures
console.log('💥 Simulating 3 failures...');
breaker.onFailure();
breaker.onFailure();
breaker.onFailure(); // Should trip here
console.log(`State after 3 failures: ${breaker.getState()}`); // OPEN
if (breaker.getState() !== 'OPEN') {
    console.error('❌ Failed: Circuit should be OPEN');
    process.exit(1);
}
try {
    breaker.check();
    console.error('❌ Failed: check() should throw when OPEN');
}
catch (e) {
    console.log(`✅ Correctly blocked execution: ${e.message}`);
}
console.log('⏳ Waiting 2.5s for reset timeout...');
setTimeout(() => {
    // Should be HALF-OPEN on next check
    try {
        // First check transitions to HALF-OPEN
        breaker.check();
        console.log(`State after timeout: ${breaker.getState()}`); // HALF-OPEN
        if (breaker.getState() !== 'HALF_OPEN') {
            console.error('❌ Failed: Circuit should be HALF_OPEN');
        }
        // Simulate Success
        console.log('✨ Simulating Success...');
        breaker.onSuccess();
        console.log(`State after success: ${breaker.getState()}`); // CLOSED
        if (breaker.getState() === 'CLOSED') {
            console.log('✅ Circuit Breaker Verified Successfully!');
        }
        else {
            console.error('❌ Failed: Circuit should be CLOSED');
        }
    }
    catch (e) {
        console.error(`❌ Unexpected error: ${e}`);
    }
}, 2500);
//# sourceMappingURL=verify-ksanti.js.map