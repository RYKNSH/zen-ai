import type { ZenPlugin, KnowledgeGift, KnowledgePacket, ActiveStrategies, SelfModel } from "@zen-ai/core";
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
/** Export a knowledge packet from an agent's self-model. */
export declare function exportKnowledgePacket(agentId: string, selfModel: Readonly<SelfModel>, pendingGifts: KnowledgeGift[]): KnowledgePacket;
/** Import gifts from a packet, filtered by confidence threshold. */
export declare function importKnowledgeGifts(packet: KnowledgePacket, myAgentId: string, minConfidence: number, maxImports: number): KnowledgeGift[];
/** Merge incoming strategies with current ones without overwriting. */
export declare function mergeStrategies(current: ActiveStrategies, incoming: ActiveStrategies): ActiveStrategies;
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
export declare function createDanaPlugin(config: DanaConfig): ZenPlugin;
//# sourceMappingURL=index.d.ts.map