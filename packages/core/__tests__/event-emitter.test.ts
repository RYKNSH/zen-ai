import { describe, it, expect, vi, beforeEach } from "vitest";
import { TypedEventEmitter } from "../src/event-emitter.js";

interface TestEvents {
    "test:event": { value: number };
    "test:string": { message: string };
}

class TestEmitter extends TypedEventEmitter<TestEvents> {
    // Expose emit for testing
    public testEmit<K extends keyof TestEvents>(
        event: K,
        payload: TestEvents[K],
    ) {
        this.emit(event, payload);
    }
}

describe("TypedEventEmitter", () => {
    let emitter: TestEmitter;

    beforeEach(() => {
        emitter = new TestEmitter();
    });

    it("should register and fire listeners", () => {
        const listener = vi.fn();
        emitter.on("test:event", listener);
        emitter.testEmit("test:event", { value: 42 });
        expect(listener).toHaveBeenCalledWith({ value: 42 });
    });

    it("should support multiple listeners", () => {
        const listener1 = vi.fn();
        const listener2 = vi.fn();
        emitter.on("test:event", listener1);
        emitter.on("test:event", listener2);
        emitter.testEmit("test:event", { value: 1 });
        expect(listener1).toHaveBeenCalledOnce();
        expect(listener2).toHaveBeenCalledOnce();
    });

    it("should unregister listeners with off()", () => {
        const listener = vi.fn();
        emitter.on("test:event", listener);
        emitter.off("test:event", listener);
        emitter.testEmit("test:event", { value: 1 });
        expect(listener).not.toHaveBeenCalled();
    });

    it("should fire once() listener only once", () => {
        const listener = vi.fn();
        emitter.once("test:event", listener);
        emitter.testEmit("test:event", { value: 1 });
        emitter.testEmit("test:event", { value: 2 });
        expect(listener).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenCalledWith({ value: 1 });
    });

    it("should not fire listeners for other events", () => {
        const listener = vi.fn();
        emitter.on("test:event", listener);
        emitter.testEmit("test:string", { message: "hello" });
        expect(listener).not.toHaveBeenCalled();
    });

    it("should removeAllListeners for a specific event", () => {
        const listener = vi.fn();
        emitter.on("test:event", listener);
        emitter.removeAllListeners("test:event");
        emitter.testEmit("test:event", { value: 1 });
        expect(listener).not.toHaveBeenCalled();
    });

    it("should removeAllListeners for all events", () => {
        const l1 = vi.fn();
        const l2 = vi.fn();
        emitter.on("test:event", l1);
        emitter.on("test:string", l2);
        emitter.removeAllListeners();
        emitter.testEmit("test:event", { value: 1 });
        emitter.testEmit("test:string", { message: "hi" });
        expect(l1).not.toHaveBeenCalled();
        expect(l2).not.toHaveBeenCalled();
    });
});
