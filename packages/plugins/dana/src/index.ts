// ============================================================================
// ZEN AI SDK — @zen-ai/plugin-dana (布施 / Knowledge Sharing)
// "The second perfection: generosity transcends the self."
// ============================================================================
//
// Dana (दान) — the Knowledge Sharing Plugin for ZEN AI.
//
// This plugin implements the second of the Six Perfections (六波羅蜜多).
// It enables agents to share learned strategies, warnings, and insights
// with other agents, creating a knowledge ecosystem that transcends
// individual agent lifetimes.
//
// Hooks used:
//   - onEvolution: Capture evolved knowledge for sharing
//   - afterAction:  Track knowledge worth sharing
//   - beforeDecide: Inject imported knowledge into prompts
// ============================================================================

import type {
    ZenPlugin,
    ZenPluginHooks,
    PluginContext,
    Action,
    ToolResult,
    SelfEvolutionRecord,
    KnowledgeGift,
    KnowledgePacket,
    ActiveStrategies,
    SelfModel,
    Goal,
} from "@zen-ai/core";

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for the Dana plugin. */
export interface DanaConfig {
    /** Unique identifier for this agent (used in packet metadata). */
    agentId: string;
    /** Directory for knowledge packet exchange. */
    exchangeDir: string;
    /** Minimum confidence threshold for sharing knowledge (0-1). Default: 0.6. */
    minConfidence?: number;
    /** Maximum gifts to import from a single packet. Default: 10. */
    maxImportsPerPacket?: number;
    /** Auto-export on evolution events? Default: true. */
    autoExport?: boolean;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Metrics tracked by the Dana plugin. */
export interface DanaMetrics {
    /** Total gifts exported. */
    giftsExported: number;
    /** Total gifts imported. */
    giftsImported: number;
    /** Total packets written. */
    packetsWritten: number;
    /** Total packets read. */
    packetsRead: number;
    /** Gifts that were merged into active strategies. */
    giftsMerged: number;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/** Export a knowledge packet from an agent's self-model. */
export function exportKnowledgePacket(
    agentId: string,
    selfModel: Readonly<SelfModel>,
    pendingGifts: KnowledgeGift[],
): KnowledgePacket {
    return {
        version: 1,
        sourceAgentId: agentId,
        createdAt: new Date().toISOString(),
        gifts: pendingGifts,
        strategies: { ...selfModel.activeStrategies },
        evolutionSummary: selfModel.evolutionLog
            .slice(-10)
            .map((e) => `[${e.type}] ${e.change}: ${e.reason}`),
    };
}

/** Import gifts from a packet, filtered by confidence threshold. */
export function importKnowledgeGifts(
    packet: KnowledgePacket,
    myAgentId: string,
    minConfidence: number,
    maxImports: number,
): KnowledgeGift[] {
    // Don't import your own packets
    if (packet.sourceAgentId === myAgentId) return [];

    return packet.gifts
        .filter((g) => g.confidence >= minConfidence)
        .slice(0, maxImports);
}

/** Merge incoming strategies with current ones without overwriting. */
export function mergeStrategies(
    current: ActiveStrategies,
    incoming: ActiveStrategies,
): ActiveStrategies {
    // Merge tool preferences: average the weights
    const mergedPrefs = { ...current.toolPreferences };
    for (const [tool, weight] of Object.entries(incoming.toolPreferences)) {
        if (tool in mergedPrefs) {
            mergedPrefs[tool] = (mergedPrefs[tool] + weight) / 2;
        } else {
            // New tool preference from another agent — apply with lower weight
            mergedPrefs[tool] = weight * 0.7;
        }
    }

    // Merge avoid patterns: union (deduplicate)
    const mergedAvoid = [
        ...new Set([...current.avoidPatterns, ...incoming.avoidPatterns]),
    ];

    // Merge approach hints: union (deduplicate)
    const mergedHints = [
        ...new Set([...current.approachHints, ...incoming.approachHints]),
    ];

    return {
        toolPreferences: mergedPrefs,
        avoidPatterns: mergedAvoid,
        approachHints: mergedHints,
    };
}

// ---------------------------------------------------------------------------
// File I/O Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function writePacket(dir: string, packet: KnowledgePacket): void {
    ensureDir(dir);
    const filename = `dana_${packet.sourceAgentId}_${Date.now()}.json`;
    writeFileSync(join(dir, filename), JSON.stringify(packet, null, 2), "utf-8");
}

function readPackets(dir: string): KnowledgePacket[] {
    if (!existsSync(dir)) return [];
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(dir).filter((f: string) => f.startsWith("dana_") && f.endsWith(".json"));
    const packets: KnowledgePacket[] = [];
    for (const file of files) {
        try {
            const content = readFileSync(join(dir, file), "utf-8");
            const packet = JSON.parse(content) as KnowledgePacket;
            if (packet.version === 1) {
                packets.push(packet);
            }
        } catch {
            // Skip malformed packets silently
        }
    }
    return packets;
}

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create a Dana (Knowledge Sharing) plugin.
 *
 * Usage:
 * ```ts
 * const agent = new ZenAgent({ ... });
 * await agent.use(createDanaPlugin({
 *     agentId: "agent-alpha",
 *     exchangeDir: "/tmp/zen-ai-dana",
 * }));
 * ```
 */
export function createDanaPlugin(config: DanaConfig): ZenPlugin {
    const {
        agentId,
        exchangeDir,
        minConfidence = 0.6,
        maxImportsPerPacket = 10,
        autoExport = true,
    } = config;

    let metrics: DanaMetrics = {
        giftsExported: 0,
        giftsImported: 0,
        packetsWritten: 0,
        packetsRead: 0,
        giftsMerged: 0,
    };

    // Pending gifts to be exported in the next packet
    const pendingGifts: KnowledgeGift[] = [];

    // Imported knowledge (for prompt injection)
    let importedInsights: string[] = [];
    let hasImported = false;

    const hooks: ZenPluginHooks = {
        /**
         * onEvolution: When the agent evolves, capture the evolution as a gift.
         */
        async onEvolution(ctx: PluginContext, record: SelfEvolutionRecord) {
            const gift: KnowledgeGift = {
                id: randomUUID(),
                type: record.type === "approach_shift" ? "insight" : "strategy",
                description: record.change,
                payload: {
                    reason: record.reason,
                    type: record.type,
                },
                confidence: 0.7, // Moderate confidence for self-evolved knowledge
                sourceContext: ctx.goal.description,
            };
            pendingGifts.push(gift);

            // Auto-export if enabled and we have enough gifts
            if (autoExport && pendingGifts.length >= 3) {
                try {
                    const packet = exportKnowledgePacket(agentId, ctx.selfModel, [...pendingGifts]);
                    writePacket(exchangeDir, packet);
                    metrics.giftsExported += pendingGifts.length;
                    metrics.packetsWritten++;
                    pendingGifts.length = 0;
                } catch {
                    // Silently fail — don't disrupt the agent
                }
            }
        },

        /**
         * afterAction: After significant actions, check for knowledge worth sharing.
         */
        async afterAction(ctx: PluginContext, action: Action, result: ToolResult) {
            // Track repeated failures as warnings to share
            if (!result.success && result.error) {
                const gift: KnowledgeGift = {
                    id: randomUUID(),
                    type: "warning",
                    description: `Tool "${action.toolName}" failed: ${result.error}`,
                    payload: {
                        toolName: action.toolName,
                        error: result.error,
                        parameters: action.parameters,
                    },
                    confidence: 0.5, // Lower confidence for individual failures
                    sourceContext: ctx.goal.description,
                };
                pendingGifts.push(gift);
            }
        },

        /**
         * beforeDecide: Import knowledge from other agents and inject into prompt.
         */
        async beforeDecide(ctx: PluginContext): Promise<string[]> {
            // Only import once per run to avoid redundant reads
            if (!hasImported) {
                try {
                    const packets = readPackets(exchangeDir);
                    metrics.packetsRead += packets.length;

                    for (const packet of packets) {
                        const gifts = importKnowledgeGifts(packet, agentId, minConfidence, maxImportsPerPacket);
                        metrics.giftsImported += gifts.length;

                        for (const gift of gifts) {
                            importedInsights.push(`[${gift.type}] ${gift.description}`);
                        }
                    }
                    hasImported = true;
                } catch {
                    // Silently fail
                }
            }

            if (importedInsights.length === 0) return [];

            return [
                `## 🎁 Shared Knowledge (Dana)\n${importedInsights.map((i) => `- ${i}`).join("\n")}`,
            ];
        },
    };

    return {
        name: "dana",
        description: "Knowledge Sharing — the second perfection (布施). Enables agent-to-agent knowledge transfer.",
        hooks,
        install() {
            // Reset state
            metrics = {
                giftsExported: 0,
                giftsImported: 0,
                packetsWritten: 0,
                packetsRead: 0,
                giftsMerged: 0,
            };
            importedInsights = [];
            hasImported = false;

            // Ensure exchange directory exists
            ensureDir(exchangeDir);
        },
    };
}

/** Get the current Dana metrics. */
export function getDanaMetrics(): DanaMetrics | null {
    return null; // Metrics are internal; use events for monitoring
}
