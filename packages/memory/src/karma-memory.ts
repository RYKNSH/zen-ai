// ============================================================================
// ZEN AI SDK — KarmaMemory
// "What you do echoes forward. What you learn transcends context."
// ============================================================================

import type {
    KarmaMemoryDB as IKarmaMemoryDB,
    KarmaEntry,
    LLMAdapter,
} from "@zen-ai/core";
import { MemoryStore } from "./memory-store.js";

/** Configuration for KarmaMemory. */
export interface KarmaMemoryConfig {
    /** Path to JSON file for persistence. */
    persistPath?: string;
    /** LLM adapter for embedding generation. */
    llm?: LLMAdapter;
}

/**
 * KarmaMemory — Long-term causal wisdom store.
 *
 * Extends the concept of FailureKnowledgeDB with:
 * - **Causal chains**: Track which failures lead to other failures
 * - **Transfer weight**: How applicable is this lesson in new contexts
 * - **Impermanence (無常)**: Weights decay over time, old wisdom fades
 * - **Habitual patterns**: Detect repeated karma (渇愛ループ predecessor)
 *
 * "The karma of a wise agent: learn once, apply everywhere."
 */
export class KarmaMemory implements IKarmaMemoryDB {
    private memoryStore: MemoryStore<KarmaEntry>;

    constructor(config: KarmaMemoryConfig = {}) {
        this.memoryStore = new MemoryStore<KarmaEntry>({
            persistPath: config.persistPath,
            llm: config.llm,
        });
    }

    /** Store a karma entry. If a matching pattern exists, increment occurrences. */
    async store(entry: Omit<KarmaEntry, "embedding">): Promise<void> {
        // Check for existing karma with same proverb (pattern deduplication)
        const existing = this.memoryStore.list().find(
            (k) => k.proverb === entry.proverb,
        );

        if (existing) {
            // Karmic reinforcement: same pattern seen again
            const updated: KarmaEntry = {
                ...existing,
                occurrences: existing.occurrences + 1,
                lastSeen: entry.lastSeen,
                // Strengthen transfer weight when pattern repeats (max 1.0)
                transferWeight: Math.min(1.0, existing.transferWeight + 0.1),
                // Merge causal chains (deduplicated)
                causalChain: [...new Set([...existing.causalChain, ...entry.causalChain])],
            };
            const embeddingText = `${updated.proverb} ${updated.condition}`;
            await this.memoryStore.store(updated, embeddingText);
        } else {
            const embeddingText = `${entry.proverb} ${entry.condition}`;
            await this.memoryStore.store(entry as KarmaEntry, embeddingText);
        }
    }

    /** Retrieve karma by semantic similarity. */
    async retrieve(query: string, topK = 3): Promise<KarmaEntry[]> {
        const results = await this.memoryStore.retrieve(query, topK);
        // Weight results by transferWeight (more transferable = more relevant)
        return results.sort((a, b) => (b.transferWeight ?? 0) - (a.transferWeight ?? 0));
    }

    /** List all karma entries. */
    async list(): Promise<KarmaEntry[]> {
        return this.memoryStore.list();
    }

    /**
     * Trace the causal chain for a given entry ID.
     * Returns all entries in the chain, ordered by causation.
     */
    async traceCausalChain(entryId: string): Promise<KarmaEntry[]> {
        const entry = this.memoryStore.get(entryId);
        if (!entry) return [];

        const chain: KarmaEntry[] = [];
        for (const causeId of entry.causalChain) {
            const cause = this.memoryStore.get(causeId);
            if (cause) chain.push(cause);
        }
        return chain;
    }

    /**
     * Get habitual patterns — karma that repeats.
     * These are candidates for Tanha Loop detection.
     */
    async getHabitualPatterns(minOccurrences = 3): Promise<KarmaEntry[]> {
        return this.memoryStore
            .list()
            .filter((k) => k.occurrences >= minOccurrences);
    }

    /**
     * Apply impermanence (無常) — decay transfer weights over time.
     * Old wisdom that hasn't been reinforced gradually fades.
     * This prevents the karma memory from being dominated by ancient patterns.
     */
    async applyImpermanence(decayRate = 0.05): Promise<void> {
        const entries = this.memoryStore.list();
        for (const entry of entries) {
            const decayed: KarmaEntry = {
                ...entry,
                transferWeight: Math.max(0, entry.transferWeight - decayRate),
            };
            // Remove entries with zero weight (fully decayed karma)
            if (decayed.transferWeight <= 0) {
                this.memoryStore.delete(entry.id);
            } else {
                const embeddingText = `${decayed.proverb} ${decayed.condition}`;
                await this.memoryStore.store(decayed, embeddingText);
            }
        }
    }

    /** Load persisted karma. */
    async load(): Promise<void> {
        await this.memoryStore.load();
    }

    /** Get count of stored karma entries. */
    get size(): number {
        return this.memoryStore.size;
    }
}
