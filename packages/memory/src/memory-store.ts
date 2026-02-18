// ============================================================================
// ZEN AI SDK — Memory Store
// In-memory vector store with optional JSON file persistence.
// ============================================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { LLMAdapter } from "@zen-ai/core";
import { cosineSimilarity, topKSimilar } from "./vector-utils.js";

/** A stored entry with an ID and optional embedding. */
export interface StoreEntry {
    id: string;
    embedding?: number[];
    [key: string]: any;
}

/** Configuration for a MemoryStore. */
export interface MemoryStoreConfig {
    /** Path to JSON file for persistence (optional). */
    persistPath?: string;
    /** LLM adapter for generating embeddings. */
    llm?: LLMAdapter;
}

/**
 * MemoryStore — In-memory vector store with JSON persistence.
 *
 * Stores entries with optional embedding vectors. When an LLM adapter
 * is provided, embeddings are generated automatically on store().
 * Retrieval uses cosine similarity for semantic search.
 */
export class MemoryStore<T extends StoreEntry> {
    private entries = new Map<string, T>();
    private persistPath?: string;
    private llm?: LLMAdapter;
    private dirty = false;

    constructor(config: MemoryStoreConfig = {}) {
        this.persistPath = config.persistPath;
        this.llm = config.llm;
    }

    /** Store an entry, optionally generating an embedding. */
    async store(entry: T, embeddingText?: string): Promise<void> {
        // Generate embedding if LLM is available and text is provided
        if (this.llm && embeddingText && !entry.embedding) {
            entry.embedding = await this.llm.embed(embeddingText);
        }

        this.entries.set(entry.id, entry);
        this.dirty = true;

        // Auto-persist
        if (this.persistPath) {
            await this.save();
        }
    }

    /** Retrieve entries by semantic similarity. */
    async retrieve(query: string, topK = 5): Promise<T[]> {
        if (!this.llm) {
            // Fallback: return all entries if no embedding capability
            return Array.from(this.entries.values()).slice(0, topK);
        }

        const queryEmbedding = await this.llm.embed(query);
        const items = Array.from(this.entries.values());
        const results = topKSimilar(queryEmbedding, items, topK);

        return results.map(({ score, ...entry }) => entry as unknown as T);
    }

    /** Get an entry by ID. */
    get(id: string): T | undefined {
        return this.entries.get(id);
    }

    /** Delete an entry by ID. */
    delete(id: string): boolean {
        const existed = this.entries.delete(id);
        if (existed) this.dirty = true;
        return existed;
    }

    /** List all entries. */
    list(): T[] {
        return Array.from(this.entries.values());
    }

    /** Number of stored entries. */
    get size(): number {
        return this.entries.size;
    }

    /** Save to JSON file. */
    async save(): Promise<void> {
        if (!this.persistPath || !this.dirty) return;

        const data = JSON.stringify(this.list(), null, 2);
        await mkdir(dirname(this.persistPath), { recursive: true });
        await writeFile(this.persistPath, data, "utf-8");
        this.dirty = false;
    }

    /** Load from JSON file. */
    async load(): Promise<void> {
        if (!this.persistPath) return;

        try {
            const data = await readFile(this.persistPath, "utf-8");
            const entries: T[] = JSON.parse(data);
            this.entries.clear();
            for (const entry of entries) {
                this.entries.set(entry.id, entry);
            }
            this.dirty = false;
        } catch {
            // File doesn't exist yet — that's fine
        }
    }
}
