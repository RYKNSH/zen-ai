// ============================================================================
// ZEN AI SDK — FailureKnowledgeDB Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { FailureKnowledgeDB } from "../src/failure-db.js";

// Mock LLM adapter for embeddings
const mockLLM = {
    async complete(prompt: string) { return "yes"; },
    async embed(text: string) {
        const vector = new Array(128).fill(0);
        for (let i = 0; i < text.length; i++) {
            vector[i % 128] += text.charCodeAt(i) / 1000;
        }
        const magnitude = Math.sqrt(vector.reduce((s: number, v: number) => s + v * v, 0));
        return magnitude > 0 ? vector.map((v: number) => v / magnitude) : vector;
    },
    async chat() { return { content: "ok", toolCalls: undefined }; },
};

function makeFailure(id: string, proverb: string, condition: string) {
    return { id, proverb, condition, severity: "HIGH" as const, source: "test" };
}

describe("FailureKnowledgeDB", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-failure-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should store and retrieve failure entries", async () => {
        const db = new FailureKnowledgeDB({ llm: mockLLM });

        await db.store(makeFailure("f1", "Never deploy on Friday", "When it's the end of the work week"));

        const results = await db.retrieve("deploy timing", 1);
        expect(results).toHaveLength(1);
        expect(results[0].proverb).toBe("Never deploy on Friday");
    });

    it("should export current failures", async () => {
        const db = new FailureKnowledgeDB({ llm: mockLLM });

        await db.store(makeFailure("f1", "p1", "c1"));
        await db.store(makeFailure("f2", "p2", "c2"));

        const exports = db.exportCurrent();
        expect(exports).toHaveLength(2);
        expect(exports[0].proverb).toBe("p1");
        expect(exports[1].proverb).toBe("p2");
    });

    it("should persist and load from file", async () => {
        const persistPath = path.join(tmpDir, "failures.json");
        const db1 = new FailureKnowledgeDB({ persistPath, llm: mockLLM });

        await db1.store(makeFailure("f1", "Test proverb", "Test condition"));

        const db2 = new FailureKnowledgeDB({ persistPath, llm: mockLLM });
        await db2.load();

        const entries = await db2.list();
        expect(entries).toHaveLength(1);
        expect(entries[0].proverb).toBe("Test proverb");
    });

    it("should return empty array when no failures stored", async () => {
        const db = new FailureKnowledgeDB({ llm: mockLLM });
        const results = await db.retrieve("anything", 5);
        expect(results).toHaveLength(0);
    });

    it("should work without LLM (no semantic search)", async () => {
        const db = new FailureKnowledgeDB({});
        await db.store(makeFailure("f1", "Basic test", "Basic cond"));

        const exports = db.exportCurrent();
        expect(exports).toHaveLength(1);
    });

    it("should clear current session", async () => {
        const db = new FailureKnowledgeDB({ llm: mockLLM });
        await db.store(makeFailure("f1", "p1", "c1"));

        expect(db.exportCurrent()).toHaveLength(1);
        db.clearCurrentSession();
        expect(db.exportCurrent()).toHaveLength(0);
    });
});
