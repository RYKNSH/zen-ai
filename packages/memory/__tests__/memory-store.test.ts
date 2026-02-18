import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryStore } from "../src/memory-store.js";
import type { LLMAdapter } from "@zen-ai/core";

const mockLLM: LLMAdapter = {
    complete: vi.fn().mockResolvedValue("test"),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]),
    chat: vi.fn().mockResolvedValue({ content: "ok" }),
};

interface TestEntry {
    id: string;
    name: string;
    embedding?: number[];
}

describe("MemoryStore", () => {
    let store: MemoryStore<TestEntry>;

    beforeEach(() => {
        vi.clearAllMocks();
        store = new MemoryStore<TestEntry>({ llm: mockLLM });
    });

    it("should store and list entries", async () => {
        await store.store({ id: "1", name: "Test Entry" } as TestEntry, "test text");
        const entries = store.list();
        expect(entries).toHaveLength(1);
        expect(entries[0].name).toBe("Test Entry");
        expect(entries[0].embedding).toBeDefined();
    });

    it("should generate embeddings via LLM", async () => {
        await store.store({ id: "1", name: "Test" } as TestEntry, "embedding text");
        expect(mockLLM.embed).toHaveBeenCalledWith("embedding text");
    });

    it("should retrieve entries by semantic search", async () => {
        await store.store({ id: "a", name: "Alpha" } as TestEntry, "alpha text");
        await store.store({ id: "b", name: "Beta" } as TestEntry, "beta text");

        const results = await store.retrieve("query", 1);
        expect(results).toHaveLength(1);
    });

    it("should list all entries", async () => {
        await store.store({ id: "1", name: "A" } as TestEntry, "a");
        await store.store({ id: "2", name: "B" } as TestEntry, "b");
        expect(store.list()).toHaveLength(2);
    });

    it("should work without LLM (no embeddings)", async () => {
        const storeNoLLM = new MemoryStore<TestEntry>({});
        await storeNoLLM.store({ id: "1", name: "Test" } as TestEntry, "text");
        const entries = storeNoLLM.list();
        expect(entries).toHaveLength(1);
        expect(entries[0].embedding).toBeUndefined();
    });
});
