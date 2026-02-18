// ============================================================================
// ZEN AI SDK — Type-Safe Event Emitter
// ============================================================================

/**
 * A strongly-typed EventEmitter.
 * @typeParam Events - A record mapping event names to their payload types.
 */
export class TypedEventEmitter<Events extends Record<string, any>> {
    private listeners = new Map<keyof Events, Set<(payload: any) => void>>();

    /** Register a listener for a specific event. */
    on<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
        return this;
    }

    /** Remove a listener for a specific event. */
    off<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this {
        this.listeners.get(event)?.delete(listener);
        return this;
    }

    /** Register a one-time listener for a specific event. */
    once<K extends keyof Events>(event: K, listener: (payload: Events[K]) => void): this {
        const wrapper = (payload: Events[K]) => {
            this.off(event, wrapper);
            listener(payload);
        };
        return this.on(event, wrapper);
    }

    /** Emit an event with the given payload. */
    protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            for (const listener of eventListeners) {
                listener(payload);
            }
        }
    }

    /** Remove all listeners for a specific event, or all events. */
    removeAllListeners(event?: keyof Events): this {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
        return this;
    }
}
