// ============================================================================
// ZEN AI SDK — FailureKnowledgeDB
// "Success is context-dependent. Failure is universal."
// ============================================================================

import type {
    FailureDB as IFailureDB,
    FailureEntry,
    LLMAdapter,
} from "@zen-ai/core";
import { MemoryStore } from "./memory-store.js";

/** Configuration for FailureKnowledgeDB. */
export interface FailureDBConfig {
    /** Path to JSON file for persistence. */
    persistPath?: string;
    /** LLM adapter for embedding generation. */
    llm?: LLMAdapter;
}

/**
 * FailureKnowledgeDB — Stores failure patterns as conditional proverbs.
 *
 * "Proverb + Condition" format compresses failure knowledge into
 * universally useful wisdom while retaining specificity.
 *
 * Example:
 *   proverb:   "Authenticate before starting work"
 *   condition: "When connecting to external services at milestone start"
 *   severity:  "HIGH"
 */
export class FailureKnowledgeDB implements IFailureDB {
    private memoryStore: MemoryStore<FailureEntry>;
    private currentSession: FailureEntry[] = [];

    constructor(config: FailureDBConfig = {}) {
        this.memoryStore = new MemoryStore<FailureEntry>({
            persistPath: config.persistPath,
            llm: config.llm,
        });
    }

    /** Store a failure as a conditional proverb. */
    async store(entry: Omit<FailureEntry, "embedding">): Promise<void> {
        const embeddingText = `${entry.proverb} ${entry.condition}`;
        const fullEntry = entry as FailureEntry;
        await this.memoryStore.store(fullEntry, embeddingText);
        this.currentSession.push(fullEntry);
    }

    /** Retrieve failure warnings semantically similar to the query. */
    async retrieve(query: string, topK = 3): Promise<FailureEntry[]> {
        return this.memoryStore.retrieve(query, topK);
    }

    /** List all stored failures. */
    async list(): Promise<FailureEntry[]> {
        return this.memoryStore.list();
    }

    /** Export failures recorded in the current session (for Context Reset). */
    exportCurrent(): FailureEntry[] {
        return [...this.currentSession];
    }

    /** Clear current session failures (called after Context Reset). */
    clearCurrentSession(): void {
        this.currentSession = [];
    }

    /** Load persisted failures. */
    async load(): Promise<void> {
        await this.memoryStore.load();
    }
}
