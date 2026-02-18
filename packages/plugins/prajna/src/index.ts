// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-prajna (般若 / Hierarchical Memory)
// "The sixth perfection: wisdom arises from organized remembrance."
// ============================================================================
//
// Prajna (प्रज्ञा) — the Hierarchical Memory Plugin for ZEN AI.
//
// This plugin implements the sixth of the Six Perfections (六波羅蜜多).
// It organizes the agent's memory into three layers:
//
//   1. Working Memory  — immediate context (current step, limited capacity)
//   2. Episodic Memory  — session-level events (auto-promoted from working)
//   3. Semantic Memory  — permanent knowledge (distilled from episodic)
//
// Hooks used:
//   - beforeObserve: Load relevant memories into context  
//   - afterAction:   Store action results in working memory
//   - onEvolution:   Promote evolved insights to semantic memory
//   - afterDelta:    Consolidate memories periodically
//   - beforeDecide:  Inject relevant memories into LLM prompt
// ============================================================================

import type {
    ZenPlugin,
    ZenPluginHooks,
    PluginContext,
    Action,
    ToolResult,
    SelfEvolutionRecord,
    Delta,
    MemoryLayer,
    MemoryEntry,
    HierarchicalMemory,
} from "@zen-ai/core";

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cosineSimilarity } from "@zen-ai/memory";

// ---------------------------------------------------------------------------
// Text → Vector (TF-IDF-like bag-of-words embedding)
// ---------------------------------------------------------------------------

/** Shared vocabulary built incrementally from all stored memories. */
const vocabulary = new Map<string, number>();
let nextVocabIdx = 0;

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\u3040-\u9faf]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

function textToVector(text: string): number[] {
    const tokens = tokenize(text);
    // Expand vocabulary
    for (const t of tokens) {
        if (!vocabulary.has(t)) {
            vocabulary.set(t, nextVocabIdx++);
        }
    }
    // Build sparse vector as dense (vocabulary may be small for agent use)
    const vec = new Array(vocabulary.size).fill(0);
    for (const t of tokens) {
        vec[vocabulary.get(t)!] += 1;
    }
    // Normalize (TF normalization)
    const len = tokens.length || 1;
    for (let i = 0; i < vec.length; i++) {
        vec[i] /= len;
    }
    return vec;
}

/** Pad a vector to match the current vocabulary size. */
function padVector(vec: number[]): number[] {
    if (vec.length >= vocabulary.size) return vec;
    return [...vec, ...new Array(vocabulary.size - vec.length).fill(0)];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// In-Memory Hierarchical Store
// ---------------------------------------------------------------------------

class PrajnaMemoryStore implements HierarchicalMemory {
    private working: Map<string, MemoryEntry & { _vec?: number[] }> = new Map();
    private episodic: Map<string, MemoryEntry & { _vec?: number[] }> = new Map();
    private semantic: Map<string, MemoryEntry & { _vec?: number[] }> = new Map();
    private persistDir: string | null;
    private maxWorking: number;
    private maxEpisodic: number;
    private workingDecay: number;
    private episodicDecay: number;
    private promotionThreshold: number;

    constructor(config: PrajnaConfig) {
        this.persistDir = config.persistDir ?? null;
        this.maxWorking = config.maxWorkingMemory ?? 20;
        this.maxEpisodic = config.maxEpisodicMemory ?? 100;
        this.workingDecay = config.workingDecayRate ?? 0.1;
        this.episodicDecay = config.episodicDecayRate ?? 0.02;
        this.promotionThreshold = config.promotionThreshold ?? 0.3;
    }

    async store(entry: Omit<MemoryEntry, "id" | "createdAt" | "lastAccessed" | "accessCount">): Promise<string> {
        const id = randomUUID();
        const now = new Date().toISOString();
        const vec = textToVector(entry.content);
        const full: MemoryEntry & { _vec?: number[] } = {
            ...entry,
            id,
            createdAt: now,
            lastAccessed: now,
            accessCount: 0,
            _vec: vec,
        };

        const layer = this.getLayerMap(entry.layer);
        layer.set(id, full);

        // Enforce capacity for working memory
        if (entry.layer === "working" && this.working.size > this.maxWorking) {
            this.evictLowestRelevance(this.working);
        }

        return id;
    }

    async retrieve(query: string, layer?: MemoryLayer, topK = 5): Promise<MemoryEntry[]> {
        const queryVec = textToVector(query);
        const queryLower = query.toLowerCase();

        type ScoredEntry = { entry: MemoryEntry & { _vec?: number[] }; score: number };
        const candidates: ScoredEntry[] = [];

        const searchLayer = (map: Map<string, MemoryEntry & { _vec?: number[] }>) => {
            for (const entry of map.values()) {
                let score = 0;

                // Vector similarity (primary)
                if (entry._vec) {
                    const paddedEntry = padVector(entry._vec);
                    const paddedQuery = padVector(queryVec);
                    // Ensure same length
                    const maxLen = Math.max(paddedEntry.length, paddedQuery.length);
                    const a = [...paddedEntry, ...new Array(Math.max(0, maxLen - paddedEntry.length)).fill(0)];
                    const b = [...paddedQuery, ...new Array(Math.max(0, maxLen - paddedQuery.length)).fill(0)];
                    score = cosineSimilarity(a, b);
                }

                // Fallback: substring match bonus
                if (entry.content.toLowerCase().includes(queryLower)) {
                    score = Math.max(score, 0.5) + 0.3;
                }

                // Threshold: only include if there's meaningful similarity
                if (score > 0.05) {
                    candidates.push({ entry, score });
                }
            }
        };

        if (layer) {
            searchLayer(this.getLayerMap(layer));
        } else {
            // Search all layers, priority: semantic > episodic > working
            searchLayer(this.semantic);
            searchLayer(this.episodic);
            searchLayer(this.working);
        }

        // Sort by combined score * relevance weight, return top K
        const results = candidates
            .sort((a, b) => {
                const scoreA = a.score * a.entry.relevance * (a.entry.accessCount + 1);
                const scoreB = b.score * b.entry.relevance * (b.entry.accessCount + 1);
                return scoreB - scoreA;
            })
            .slice(0, topK);

        // Update access metadata (side-effect separated from search)
        const now = new Date().toISOString();
        for (const { entry } of results) {
            entry.accessCount++;
            entry.lastAccessed = now;
        }

        return results.map(({ entry }) => {
            // Return clean MemoryEntry (strip internal _vec)
            const { _vec, ...clean } = entry;
            return clean;
        });
    }

    async promote(entryId: string, targetLayer: MemoryLayer): Promise<boolean> {
        // Find the entry in any layer
        for (const [layer, map] of [
            ["working", this.working],
            ["episodic", this.episodic],
            ["semantic", this.semantic],
        ] as [MemoryLayer, Map<string, MemoryEntry>][]) {
            const entry = map.get(entryId);
            if (entry) {
                map.delete(entryId);
                entry.layer = targetLayer;
                entry.relevance = Math.min(1.0, entry.relevance + 0.2); // Boost on promotion
                this.getLayerMap(targetLayer).set(entryId, entry);
                return true;
            }
        }
        return false;
    }

    async consolidate(): Promise<{ promoted: number; decayed: number }> {
        let promoted = 0;
        let decayed = 0;

        // 1. Decay working memory relevance (safe: copy keys to avoid mutation during iteration)
        const workingIds = [...this.working.keys()];
        for (const id of workingIds) {
            const entry = this.working.get(id);
            if (!entry) continue;
            entry.relevance = Math.max(0, entry.relevance - this.workingDecay);
            if (entry.relevance <= 0) {
                this.working.delete(id);
                decayed++;
            }
        }

        // 2. Promote high-relevance working → episodic (safe: copy keys)
        const workingIds2 = [...this.working.keys()];
        for (const id of workingIds2) {
            const entry = this.working.get(id);
            if (!entry) continue;
            if (entry.accessCount >= 2 || entry.relevance >= this.promotionThreshold + 0.3) {
                this.working.delete(id);
                entry.layer = "episodic";
                entry.relevance = Math.min(1.0, entry.relevance + 0.1);
                this.episodic.set(id, entry);
                promoted++;
            }
        }

        // 3. Decay episodic memory relevance (safe: copy keys)
        const episodicIds = [...this.episodic.keys()];
        for (const id of episodicIds) {
            const entry = this.episodic.get(id);
            if (!entry) continue;
            entry.relevance = Math.max(0, entry.relevance - this.episodicDecay);
            if (entry.relevance <= 0) {
                this.episodic.delete(id);
                decayed++;
            }
        }

        // 4. Promote high-value episodic → semantic (safe: copy keys)
        const episodicIds2 = [...this.episodic.keys()];
        for (const id of episodicIds2) {
            const entry = this.episodic.get(id);
            if (!entry) continue;
            if (entry.accessCount >= 5 && entry.relevance >= 0.5) {
                this.episodic.delete(id);
                entry.layer = "semantic";
                entry.relevance = 1.0;
                this.semantic.set(id, entry);
                promoted++;
            }
        }

        // 5. Enforce capacity
        if (this.episodic.size > this.maxEpisodic) {
            this.evictLowestRelevance(this.episodic);
            decayed++;
        }

        return { promoted, decayed };
    }

    stats(): { working: number; episodic: number; semantic: number } {
        return {
            working: this.working.size,
            episodic: this.episodic.size,
            semantic: this.semantic.size,
        };
    }

    // --- Persistence ---

    save(): void {
        if (!this.persistDir) return;
        if (!existsSync(this.persistDir)) {
            mkdirSync(this.persistDir, { recursive: true });
        }
        const data = {
            working: Array.from(this.working.values()),
            episodic: Array.from(this.episodic.values()),
            semantic: Array.from(this.semantic.values()),
        };
        writeFileSync(
            join(this.persistDir, "prajna_memory.json"),
            JSON.stringify(data, null, 2),
            "utf-8",
        );
    }

    load(): void {
        if (!this.persistDir) return;
        const filepath = join(this.persistDir, "prajna_memory.json");
        if (!existsSync(filepath)) return;
        try {
            const content = readFileSync(filepath, "utf-8");
            const data = JSON.parse(content) as {
                working: MemoryEntry[];
                episodic: MemoryEntry[];
                semantic: MemoryEntry[];
            };
            // Only restore episodic and semantic (working is transient)
            for (const entry of data.episodic) {
                this.episodic.set(entry.id, entry);
            }
            for (const entry of data.semantic) {
                this.semantic.set(entry.id, entry);
            }
        } catch {
            // Silently fail on malformed data
        }
    }

    // --- Private helpers ---

    private getLayerMap(layer: MemoryLayer): Map<string, MemoryEntry> {
        switch (layer) {
            case "working": return this.working;
            case "episodic": return this.episodic;
            case "semantic": return this.semantic;
        }
    }

    private evictLowestRelevance(map: Map<string, MemoryEntry>): void {
        let lowestId: string | null = null;
        let lowestRelevance = Infinity;
        for (const [id, entry] of map) {
            if (entry.relevance < lowestRelevance) {
                lowestRelevance = entry.relevance;
                lowestId = id;
            }
        }
        if (lowestId) map.delete(lowestId);
    }
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

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
export function createPrajnaPlugin(config: PrajnaConfig = {}): ZenPlugin {
    const { consolidateEvery = 5 } = config;

    let memoryStore: PrajnaMemoryStore;
    let metrics: PrajnaMetrics;
    let stepsSinceConsolidation = 0;

    const hooks: ZenPluginHooks = {
        /**
         * afterAction: Store action results in working memory.
         */
        async afterAction(ctx: PluginContext, action: Action, result: ToolResult) {
            const content = `Tool ${action.toolName}: ${result.success ? "success" : "failed"} — ${result.success ? JSON.stringify(result.output).slice(0, 200) : result.error
                }`;

            await memoryStore.store({
                layer: "working",
                content,
                metadata: {
                    toolName: action.toolName,
                    success: result.success,
                    step: ctx.stepCount,
                },
                relevance: result.success ? 0.5 : 0.8, // Failures are more relevant
            });
            metrics.totalStored++;

            stepsSinceConsolidation++;
        },

        /**
         * afterDelta: Periodically consolidate memories.
         */
        async afterDelta(ctx: PluginContext, delta: Delta) {
            if (stepsSinceConsolidation >= consolidateEvery) {
                const result = await memoryStore.consolidate();
                metrics.promotedToEpisodic += result.promoted;
                metrics.decayed += result.decayed;
                metrics.consolidations++;
                stepsSinceConsolidation = 0;

                // Auto-save after consolidation
                memoryStore.save();
            }
        },

        /**
         * onEvolution: Store evolved insights directly in semantic memory.
         */
        async onEvolution(ctx: PluginContext, record: SelfEvolutionRecord) {
            await memoryStore.store({
                layer: "semantic",
                content: `[Evolution] ${record.change}: ${record.reason}`,
                metadata: {
                    type: record.type,
                    timestamp: record.timestamp,
                },
                relevance: 1.0,
            });
            metrics.totalStored++;
            metrics.promotedToSemantic++;
        },

        /**
         * beforeDecide: Retrieve and inject relevant memories.
         */
        async beforeDecide(ctx: PluginContext): Promise<string[]> {
            const sections: string[] = [];

            // Get goal-relevant semantic memories
            const semanticMemories = await memoryStore.retrieve(
                ctx.goal.description,
                "semantic",
                3,
            );

            if (semanticMemories.length > 0) {
                sections.push(
                    `## 🧠 Long-term Knowledge (Prajna)\n${semanticMemories.map((m) => `- ${m.content}`).join("\n")}`,
                );
            }

            // Get recent episodic memories
            const episodicMemories = await memoryStore.retrieve(
                ctx.delta?.description ?? ctx.goal.description,
                "episodic",
                3,
            );

            if (episodicMemories.length > 0) {
                sections.push(
                    `## 📖 Session Knowledge\n${episodicMemories.map((m) => `- ${m.content}`).join("\n")}`,
                );
            }

            // Add memory stats
            const stats = memoryStore.stats();
            if (stats.working + stats.episodic + stats.semantic > 0) {
                sections.push(
                    `## 📊 Memory: W:${stats.working} E:${stats.episodic} S:${stats.semantic}`,
                );
            }

            return sections;
        },
    };

    return {
        name: "prajna",
        description: "Hierarchical Memory — the sixth perfection (般若). 3-layer memory with auto-promotion and consolidation.",
        hooks,
        install() {
            memoryStore = new PrajnaMemoryStore(config);
            metrics = {
                totalStored: 0,
                promotedToEpisodic: 0,
                promotedToSemantic: 0,
                decayed: 0,
                consolidations: 0,
            };
            stepsSinceConsolidation = 0;

            // Load persisted memories
            memoryStore.load();
        },
    };
}

/** Export the memory store class for standalone use. */
export { PrajnaMemoryStore };
