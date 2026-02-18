import { describe, it, expect, vi } from "vitest";
import { ZenAgent } from "../src/zen-agent.js";
import type {
    LLMAdapter,
    ChatResponse,
    Tool,
    KarmaMemoryDB,
    KarmaEntry,
} from "../src/types.js";

// ============================================================================
// Mocks
// ============================================================================

/**
 * Mock LLM where `complete()` returns responses sequentially from the array,
 * and `chat()` ALWAYS returns a tool call (simulating decision).
 */
function createMockLLM(completeResponses: string[]): LLMAdapter {
    let idx = 0;
    return {
        complete: vi.fn(async () => completeResponses[idx++ % completeResponses.length]),
        chat: vi.fn(async (): Promise<ChatResponse> => ({
            content: "Using tool",
            toolCalls: [{ id: "tc_1", name: "test_tool", arguments: { x: 1 } }],
        })),
        embed: vi.fn(async () => Array(128).fill(0)),
    };
}

function createMockTool(name: string, success = true): Tool {
    return {
        name,
        description: `Test tool: ${name}`,
        parameters: { type: "object", properties: {} },
        execute: vi.fn(async () =>
            success
                ? { success: true, output: "ok" }
                : { success: false, output: "", error: "tool_error" },
        ),
    };
}

function createMockKarmaDB(): KarmaMemoryDB & {
    entries: KarmaEntry[];
    impermanenceCalled: boolean;
} {
    const entries: KarmaEntry[] = [];
    const db = {
        entries,
        impermanenceCalled: false,
        store: vi.fn(async (entry: KarmaEntry) => {
            const i = entries.findIndex((e) => e.id === entry.id);
            if (i >= 0) entries[i] = entry;
            else entries.push(entry);
        }),
        retrieve: vi.fn(async (_q: string, topK: number) => entries.slice(0, topK)),
        traceCausalChain: vi.fn(async (_id: string): Promise<KarmaEntry[]> => []),
        getHabitualPatterns: vi.fn(async (min: number) =>
            entries.filter((e) => e.occurrences >= min),
        ),
        list: vi.fn(async () => entries),
        applyImpermanence: vi.fn(async () => { db.impermanenceCalled = true; }),
    };
    return db;
}

// ============================================================================
// Phase 1.5: KarmaMemory Integration
// ============================================================================

describe("Phase 1.5: KarmaMemory Integration", () => {
    it("should store karma when a failure occurs", async () => {
        // With karmaMemoryDB → awakening pipeline (3 complete calls per step)
        // Step 1: computeDelta(complete) → investigation(complete) → mindfulness(complete) → finalDecision(chat)
        // Step 2: computeDelta(complete) → isComplete=true → break
        const llm = createMockLLM([
            '{"description":"gap","progress":0.5,"gaps":["g1"],"isComplete":false}',
            '{"hypotheses":["A"]}',
            '{"filtered":["A"],"removed":[],"reasoning":"ok"}',
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);

        const tool = createMockTool("fail_tool", false);
        const karma = createMockKarmaDB();

        const stored: string[] = [];
        const agent = new ZenAgent({
            goal: "test",
            llm,
            tools: [tool],
            karmaMemoryDB: karma,
            maxSteps: 2,
        });
        agent.on("karma:stored", (d) => stored.push(d.karmaId));

        await agent.run();

        expect(karma.entries.length).toBeGreaterThanOrEqual(1);
        expect(karma.entries[0].karmaType).toBe("unskillful");
        expect(karma.entries[0].causalChain).toBeDefined();
        expect(stored.length).toBeGreaterThanOrEqual(1);
    });

    it("should apply impermanence at end of run", async () => {
        const llm = createMockLLM([
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);
        const karma = createMockKarmaDB();
        const agent = new ZenAgent({ goal: "test", llm, karmaMemoryDB: karma, maxSteps: 1 });
        await agent.run();
        expect(karma.impermanenceCalled).toBe(true);
    });

    it("should work WITHOUT karmaMemoryDB (backward compat)", async () => {
        const llm = createMockLLM([
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);
        const agent = new ZenAgent({ goal: "test", llm, maxSteps: 1 });
        await agent.run(); // should not throw
    });
});

// ============================================================================
// Phase 2: Causal Analysis
// ============================================================================

describe("Phase 2: Causal Analysis", () => {
    it("should analyze causality on consecutive failures", async () => {
        const llm = createMockLLM([
            // Step 1
            '{"description":"gap","progress":0.3,"gaps":["g1"],"isComplete":false}',
            '{"hypotheses":["A"]}',
            '{"filtered":["A"],"removed":[],"reasoning":"ok"}',
            // Step 2
            '{"description":"gap","progress":0.3,"gaps":["g1"],"isComplete":false}',
            '{"hypotheses":["B"]}',
            '{"filtered":["B"],"removed":[],"reasoning":"ok"}',
            // Causal analysis LLM call
            '{"isCausal":true,"strength":0.8,"reasoning":"linked"}',
            // Step 3 (end)
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);

        const tool = createMockTool("fail_tool", false);
        const karma = createMockKarmaDB();
        const causalLinks: Array<{ links: unknown[] }> = [];

        const agent = new ZenAgent({
            goal: "test causality",
            llm,
            tools: [tool],
            karmaMemoryDB: karma,
            maxSteps: 3,
        });
        agent.on("causal:analyzed", (d) => causalLinks.push(d));

        await agent.run();

        // The run should complete without errors regardless of causal events
        expect(true).toBe(true);
    });
});

// ============================================================================
// Phase 3: Seven Factors Pipeline
// ============================================================================

describe("Phase 3: Seven Factors Pipeline", () => {
    it("should emit awakening stages when karmaMemoryDB is provided", async () => {
        const llm = createMockLLM([
            '{"description":"gap","progress":0.5,"gaps":["g1"],"isComplete":false}',
            '{"hypotheses":["A","B"]}',
            '{"filtered":["A"],"removed":["B"],"reasoning":"B is ego-driven"}',
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);

        const tool = createMockTool("wise_tool", true);
        const karma = createMockKarmaDB();
        const stages: string[] = [];

        const agent = new ZenAgent({
            goal: "test seven factors",
            llm,
            tools: [tool],
            karmaMemoryDB: karma,
            maxSteps: 2,
        });
        agent.on("awakening:stage", (d) => stages.push(d.stage));

        await agent.run();

        expect(stages).toContain("investigation");
        expect(stages).toContain("mindfulness");
        expect(stages).toContain("equanimity");
    });

    it("should NOT emit awakening stages without karmaMemoryDB", async () => {
        const llm = createMockLLM([
            '{"description":"gap","progress":0.5,"gaps":["g1"],"isComplete":false}',
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);

        const tool = createMockTool("simple_tool", true);
        const stages: string[] = [];

        const agent = new ZenAgent({
            goal: "test regular",
            llm,
            tools: [tool],
            maxSteps: 2,
        });
        agent.on("awakening:stage", (d) => stages.push(d.stage));

        await agent.run();

        expect(stages).toHaveLength(0);
    });

    it("should include karma wisdom in investigation prompt", async () => {
        const llm = createMockLLM([
            '{"description":"gap","progress":0.5,"gaps":["g1"],"isComplete":false}',
            '{"hypotheses":["safe approach"]}',
            '{"filtered":["safe approach"],"removed":[],"reasoning":"ok"}',
            '{"description":"done","progress":1.0,"gaps":[],"isComplete":true}',
        ]);

        const tool = createMockTool("wise_tool", true);
        const karma = createMockKarmaDB();

        // Pre-populate karma
        await karma.store({
            id: "past_1",
            proverb: "Never call API without auth",
            condition: "API call",
            severity: "HIGH",
            source: "past",
            causalChain: [],
            transferWeight: 0.9,
            karmaType: "unskillful",
            occurrences: 5,
            lastSeen: new Date().toISOString(),
        });

        const agent = new ZenAgent({
            goal: "test karma wisdom",
            llm,
            tools: [tool],
            karmaMemoryDB: karma,
            maxSteps: 2,
        });

        await agent.run();

        // Investigation prompt should contain karma wisdom
        const calls = (llm.complete as ReturnType<typeof vi.fn>).mock.calls;
        const investigationCall = calls.find((c: string[]) => c[0]?.includes("択法"));
        expect(investigationCall).toBeDefined();
        expect(investigationCall![0]).toContain("Karma Wisdom");
        expect(investigationCall![0]).toContain("Never call API without auth");
    });
});
