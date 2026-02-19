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
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cosineSimilarity } from "@zen-ai/memory";
// ---------------------------------------------------------------------------
// Text → Vector (TF-IDF-like bag-of-words embedding)
// ---------------------------------------------------------------------------
/** Shared vocabulary built incrementally from all stored memories. */
const vocabulary = new Map();
let nextVocabIdx = 0;
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\u3040-\u9faf]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
}
function textToVector(text) {
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
        vec[vocabulary.get(t)] += 1;
    }
    // Normalize (TF normalization)
    const len = tokens.length || 1;
    for (let i = 0; i < vec.length; i++) {
        vec[i] /= len;
    }
    return vec;
}
/** Pad a vector to match the current vocabulary size. */
function padVector(vec) {
    if (vec.length >= vocabulary.size)
        return vec;
    return [...vec, ...new Array(vocabulary.size - vec.length).fill(0)];
}
// ---------------------------------------------------------------------------
// In-Memory Hierarchical Store
// ---------------------------------------------------------------------------
class PrajnaMemoryStore {
    working = new Map();
    episodic = new Map();
    semantic = new Map();
    persistDir;
    maxWorking;
    maxEpisodic;
    workingDecay;
    episodicDecay;
    promotionThreshold;
    embedFn;
    constructor(config) {
        this.persistDir = config.persistDir ?? null;
        this.maxWorking = config.maxWorkingMemory ?? 20;
        this.maxEpisodic = config.maxEpisodicMemory ?? 100;
        this.workingDecay = config.workingDecayRate ?? 0.1;
        this.episodicDecay = config.episodicDecayRate ?? 0.02;
        this.promotionThreshold = config.promotionThreshold ?? 0.3;
        this.embedFn = config.embedFn ?? null;
    }
    async store(entry) {
        const id = randomUUID();
        const now = new Date().toISOString();
        // Use LLM embeddings if available, otherwise TF-IDF fallback
        const vec = this.embedFn
            ? await this.embedFn(entry.content)
            : textToVector(entry.content);
        const full = {
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
    async retrieve(query, layer, topK = 5) {
        // Use LLM embeddings if available, otherwise TF-IDF fallback
        const queryVec = this.embedFn
            ? await this.embedFn(query)
            : textToVector(query);
        const queryLower = query.toLowerCase();
        const candidates = [];
        const searchLayer = (map) => {
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
        }
        else {
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
    async promote(entryId, targetLayer) {
        // Find the entry in any layer
        for (const [layer, map] of [
            ["working", this.working],
            ["episodic", this.episodic],
            ["semantic", this.semantic],
        ]) {
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
    async consolidate() {
        let promoted = 0;
        let decayed = 0;
        // 1. Decay working memory relevance (safe: copy keys to avoid mutation during iteration)
        const workingIds = [...this.working.keys()];
        for (const id of workingIds) {
            const entry = this.working.get(id);
            if (!entry)
                continue;
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
            if (!entry)
                continue;
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
            if (!entry)
                continue;
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
            if (!entry)
                continue;
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
    stats() {
        return {
            working: this.working.size,
            episodic: this.episodic.size,
            semantic: this.semantic.size,
        };
    }
    // --- Persistence ---
    save() {
        if (!this.persistDir)
            return;
        if (!existsSync(this.persistDir)) {
            mkdirSync(this.persistDir, { recursive: true });
        }
        const data = {
            working: Array.from(this.working.values()),
            episodic: Array.from(this.episodic.values()),
            semantic: Array.from(this.semantic.values()),
        };
        writeFileSync(join(this.persistDir, "prajna_memory.json"), JSON.stringify(data, null, 2), "utf-8");
    }
    load() {
        if (!this.persistDir)
            return;
        const filepath = join(this.persistDir, "prajna_memory.json");
        if (!existsSync(filepath))
            return;
        try {
            const content = readFileSync(filepath, "utf-8");
            const data = JSON.parse(content);
            // Only restore episodic and semantic (working is transient)
            for (const entry of data.episodic) {
                this.episodic.set(entry.id, entry);
            }
            for (const entry of data.semantic) {
                this.semantic.set(entry.id, entry);
            }
        }
        catch {
            // Silently fail on malformed data
        }
    }
    // --- Private helpers ---
    getLayerMap(layer) {
        switch (layer) {
            case "working": return this.working;
            case "episodic": return this.episodic;
            case "semantic": return this.semantic;
        }
    }
    evictLowestRelevance(map) {
        let lowestId = null;
        let lowestRelevance = Infinity;
        for (const [id, entry] of map) {
            if (entry.relevance < lowestRelevance) {
                lowestRelevance = entry.relevance;
                lowestId = id;
            }
        }
        if (lowestId)
            map.delete(lowestId);
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
export function createPrajnaPlugin(config = {}) {
    const { consolidateEvery = 5 } = config;
    let memoryStore;
    let metrics;
    let stepsSinceConsolidation = 0;
    const hooks = {
        /**
         * afterAction: Store action results in working memory.
         */
        async afterAction(ctx, action, result) {
            const content = `Tool ${action.toolName}: ${result.success ? "success" : "failed"} — ${result.success ? JSON.stringify(result.output).slice(0, 200) : result.error}`;
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
        async afterDelta(ctx, delta) {
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
        async onEvolution(ctx, record) {
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
        async beforeDecide(ctx) {
            const sections = [];
            // Get goal-relevant semantic memories
            const semanticMemories = await memoryStore.retrieve(ctx.goal.description, "semantic", 3);
            if (semanticMemories.length > 0) {
                sections.push(`## 🧠 Long-term Knowledge (Prajna)\n${semanticMemories.map((m) => `- ${m.content}`).join("\n")}`);
            }
            // Get recent episodic memories
            const episodicMemories = await memoryStore.retrieve(ctx.delta?.description ?? ctx.goal.description, "episodic", 3);
            if (episodicMemories.length > 0) {
                sections.push(`## 📖 Session Knowledge\n${episodicMemories.map((m) => `- ${m.content}`).join("\n")}`);
            }
            // Add memory stats
            const stats = memoryStore.stats();
            if (stats.working + stats.episodic + stats.semantic > 0) {
                sections.push(`## 📊 Memory: W:${stats.working} E:${stats.episodic} S:${stats.semantic}`);
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
//# sourceMappingURL=index.js.map