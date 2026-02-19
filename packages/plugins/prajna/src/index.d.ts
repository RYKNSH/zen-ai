import type { ZenPlugin, MemoryLayer, MemoryEntry, HierarchicalMemory } from "@zen-ai/core";
/** Configuration for the Prajna plugin. */
export interface PrajnaConfig {
    /** Directory for memory persistence. */
    persistDir?: string;
    /** Maximum working memory entries. Default: 20. */
    maxWorkingMemory?: number;
    /** Maximum episodic memory entries. Default: 100. */
    maxEpisodicMemory?: number;
    /** Consolidation interval (in steps). Default: 5. */
    consolidateEvery?: number;
    /** Relevance decay rate per step for working memory. Default: 0.1. */
    workingDecayRate?: number;
    /** Relevance decay rate per step for episodic memory. Default: 0.02. */
    episodicDecayRate?: number;
    /** Minimum relevance to promote from working to episodic. Default: 0.3. */
    promotionThreshold?: number;
    /**
     * Optional: LLM embedding function for true semantic search.
     * When provided, uses real embeddings instead of TF-IDF.
     * Example: `(text) => llm.embed(text)`
     */
    embedFn?: (text: string) => Promise<number[]>;
}
/** Metrics tracked by the Prajna plugin. */
export interface PrajnaMetrics {
    /** Total memories stored across all layers. */
    totalStored: number;
    /** Promotions from working → episodic. */
    promotedToEpisodic: number;
    /** Promotions from episodic → semantic. */
    promotedToSemantic: number;
    /** Memories that decayed (removed). */
    decayed: number;
    /** Consolidation cycles run. */
    consolidations: number;
}
declare class PrajnaMemoryStore implements HierarchicalMemory {
    private working;
    private episodic;
    private semantic;
    private persistDir;
    private maxWorking;
    private maxEpisodic;
    private workingDecay;
    private episodicDecay;
    private promotionThreshold;
    private embedFn;
    constructor(config: PrajnaConfig);
    store(entry: Omit<MemoryEntry, "id" | "createdAt" | "lastAccessed" | "accessCount">): Promise<string>;
    retrieve(query: string, layer?: MemoryLayer, topK?: number): Promise<MemoryEntry[]>;
    promote(entryId: string, targetLayer: MemoryLayer): Promise<boolean>;
    consolidate(): Promise<{
        promoted: number;
        decayed: number;
    }>;
    stats(): {
        working: number;
        episodic: number;
        semantic: number;
    };
    save(): void;
    load(): void;
    private getLayerMap;
    private evictLowestRelevance;
}
/**
 * Create a Prajna (Hierarchical Memory) plugin.
 *
 * Usage:
 * ```ts
 * const agent = new ZenAgent({ ... });
 * await agent.use(createPrajnaPlugin({
 *     persistDir: "./data/prajna",
 *     maxWorkingMemory: 20,
 * }));
 * ```
 */
export declare function createPrajnaPlugin(config?: PrajnaConfig): ZenPlugin;
/** Export the memory store class for standalone use. */
export { PrajnaMemoryStore };
//# sourceMappingURL=index.d.ts.map