// ============================================================================
// ZEN AI SDK — SkillDB
// "Store skills concretely. Abstraction kills executability."
// ============================================================================

import type { SkillDB as ISkillDB, SkillEntry, LLMAdapter } from "@zen-ai/core";
import { MemoryStore } from "./memory-store.js";

/** Configuration for SkillDB. */
export interface SkillDBConfig {
    /** Path to JSON file for persistence. */
    persistPath?: string;
    /** LLM adapter for embedding generation. */
    llm?: LLMAdapter;
}

/**
 * SkillDB — Stores executable skills in their concrete form.
 *
 * Skills are stored as trigger/command/condition triples and retrieved
 * via semantic search. Unlike traditional knowledge bases, skills are
 * kept in their specific, executable form — abstraction is avoided.
 */
export class SkillDB implements ISkillDB {
    private memoryStore: MemoryStore<SkillEntry>;

    constructor(config: SkillDBConfig = {}) {
        this.memoryStore = new MemoryStore<SkillEntry>({
            persistPath: config.persistPath,
            llm: config.llm,
        });
    }

    /** Store a new skill. Embedding is generated from trigger + condition. */
    async store(entry: Omit<SkillEntry, "embedding">): Promise<void> {
        const embeddingText = `${entry.trigger} ${entry.condition}`;
        await this.memoryStore.store(entry as SkillEntry, embeddingText);
    }

    /** Retrieve skills semantically similar to the query. */
    async retrieve(query: string, topK = 3): Promise<SkillEntry[]> {
        return this.memoryStore.retrieve(query, topK);
    }

    /** List all stored skills. */
    async list(): Promise<SkillEntry[]> {
        return this.memoryStore.list();
    }

    /** Load persisted skills. */
    async load(): Promise<void> {
        await this.memoryStore.load();
    }
}
