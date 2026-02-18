import { describe, it, expect, vi, beforeEach } from "vitest";
import { KarmaMemory } from "../src/karma-memory.js";
import type { KarmaEntry } from "@zen-ai/core";

/** Create a basic karma entry for testing. */
function createKarmaEntry(overrides: Partial<KarmaEntry> = {}): Omit<KarmaEntry, "embedding"> {
    return {
        id: `karma_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        proverb: "Authenticate before connecting",
        condition: "When accessing external APIs",
        severity: "HIGH",
        source: "step_5",
        causalChain: [],
        transferWeight: 0.5,
        karmaType: "unskillful",
        occurrences: 1,
        lastSeen: new Date().toISOString(),
        ...overrides,
    };
}

describe("KarmaMemory", () => {
    let karma: KarmaMemory;

    beforeEach(() => {
        karma = new KarmaMemory();
    });

    // -----------------------------------------------------------------------
    // Basic CRUD
    // -----------------------------------------------------------------------
    it("should store and list karma entries", async () => {
        const entry = createKarmaEntry({ id: "k1" });
        await karma.store(entry);

        const list = await karma.list();
        expect(list).toHaveLength(1);
        expect(list[0].proverb).toBe("Authenticate before connecting");
    });

    it("should retrieve karma entries", async () => {
        await karma.store(createKarmaEntry({ id: "k1", proverb: "Check auth first" }));
        await karma.store(createKarmaEntry({ id: "k2", proverb: "Validate inputs" }));

        // Without LLM, fallback returns all entries
        const results = await karma.retrieve("auth", 5);
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    // -----------------------------------------------------------------------
    // Karmic reinforcement (deduplication)
    // -----------------------------------------------------------------------
    it("should increment occurrences when same proverb is stored again", async () => {
        const entry1 = createKarmaEntry({
            id: "k1",
            proverb: "Always check permissions",
            occurrences: 1,
            transferWeight: 0.3,
        });
        await karma.store(entry1);

        const entry2 = createKarmaEntry({
            id: "k2",
            proverb: "Always check permissions",
            occurrences: 1,
            transferWeight: 0.3,
        });
        await karma.store(entry2);

        const list = await karma.list();
        // Should deduplicate — only one entry with incremented count
        expect(list).toHaveLength(1);
        expect(list[0].occurrences).toBe(2);
        expect(list[0].transferWeight).toBe(0.4); // 0.3 + 0.1
    });

    it("should cap transferWeight at 1.0", async () => {
        const entry = createKarmaEntry({
            id: "k1",
            proverb: "Same mistake",
            transferWeight: 0.95,
        });
        await karma.store(entry);

        // Store again to trigger reinforcement
        await karma.store(createKarmaEntry({
            id: "k2",
            proverb: "Same mistake",
            transferWeight: 0.5,
        }));

        const list = await karma.list();
        expect(list[0].transferWeight).toBe(1.0);
    });

    // -----------------------------------------------------------------------
    // Causal chain
    // -----------------------------------------------------------------------
    it("should store and trace causal chains", async () => {
        await karma.store(createKarmaEntry({
            id: "root",
            proverb: "Root cause",
            causalChain: [],
        }));
        await karma.store(createKarmaEntry({
            id: "effect1",
            proverb: "First effect",
            causalChain: ["root"],
        }));
        await karma.store(createKarmaEntry({
            id: "effect2",
            proverb: "Second effect",
            causalChain: ["root", "effect1"],
        }));

        const chain = await karma.traceCausalChain("effect2");
        expect(chain).toHaveLength(2);
        expect(chain[0].id).toBe("root");
        expect(chain[1].id).toBe("effect1");
    });

    it("should return empty array for non-existent entry", async () => {
        const chain = await karma.traceCausalChain("nonexistent");
        expect(chain).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Habitual patterns
    // -----------------------------------------------------------------------
    it("should detect habitual patterns", async () => {
        const entry = createKarmaEntry({
            id: "k1",
            proverb: "Repeated mistake",
            occurrences: 5,
        });
        await karma.store(entry);

        await karma.store(createKarmaEntry({
            id: "k2",
            proverb: "One-off issue",
            occurrences: 1,
        }));

        const habitual = await karma.getHabitualPatterns(3);
        expect(habitual).toHaveLength(1);
        expect(habitual[0].proverb).toBe("Repeated mistake");
    });

    // -----------------------------------------------------------------------
    // Impermanence (無常)
    // -----------------------------------------------------------------------
    it("should decay transfer weights (impermanence)", async () => {
        await karma.store(createKarmaEntry({
            id: "k1",
            proverb: "Old wisdom",
            transferWeight: 0.3,
        }));

        await karma.applyImpermanence(0.1);

        const list = await karma.list();
        expect(list).toHaveLength(1);
        expect(list[0].transferWeight).toBeCloseTo(0.2, 5);
    });

    it("should remove entries with fully decayed weight", async () => {
        await karma.store(createKarmaEntry({
            id: "k1",
            proverb: "Ancient wisdom",
            transferWeight: 0.05,
        }));

        await karma.applyImpermanence(0.1); // 0.05 - 0.1 = -0.05 → removed

        const list = await karma.list();
        expect(list).toHaveLength(0);
    });

    it("should report correct size", async () => {
        expect(karma.size).toBe(0);
        await karma.store(createKarmaEntry({ id: "k1" }));
        expect(karma.size).toBe(1);
    });
});
