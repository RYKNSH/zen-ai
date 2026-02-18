// ============================================================================
// ZEN AI SDK — SkillDB Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SkillDB } from "../src/skill-db.js";

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

function makeSkill(id: string, trigger: string, command: string, condition: string) {
    return { id, trigger, command, condition };
}

describe("SkillDB", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-skill-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should store and retrieve skills", async () => {
        const db = new SkillDB({ llm: mockLLM });

        await db.store(makeSkill("s1", "file not found", "check file path", "when accessing files"));

        const results = await db.retrieve("file error", 1);
        expect(results).toHaveLength(1);
        expect(results[0].trigger).toBe("file not found");
    });

    it("should list all skills", async () => {
        const db = new SkillDB({ llm: mockLLM });

        await db.store(makeSkill("s1", "t1", "c1", "cond1"));
        await db.store(makeSkill("s2", "t2", "c2", "cond2"));

        const all = await db.list();
        expect(all).toHaveLength(2);
    });

    it("should persist and load from file", async () => {
        const persistPath = path.join(tmpDir, "skills.json");
        const db1 = new SkillDB({ persistPath, llm: mockLLM });

        await db1.store(makeSkill("s1", "test", "cmd", "cond"));

        const db2 = new SkillDB({ persistPath, llm: mockLLM });
        await db2.load();

        const all = await db2.list();
        expect(all).toHaveLength(1);
        expect(all[0].trigger).toBe("test");
    });

    it("should return empty list when no skills stored", async () => {
        const db = new SkillDB({ llm: mockLLM });
        const results = await db.retrieve("anything", 5);
        expect(results).toHaveLength(0);
    });

    it("should respect topK parameter", async () => {
        const db = new SkillDB({ llm: mockLLM });

        for (let i = 0; i < 10; i++) {
            await db.store(makeSkill(`s${i}`, `t${i}`, `c${i}`, `cond${i}`));
        }

        const results = await db.retrieve("test query", 3);
        expect(results.length).toBeLessThanOrEqual(3);
    });
});
