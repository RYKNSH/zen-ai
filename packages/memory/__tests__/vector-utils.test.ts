import { describe, it, expect } from "vitest";
import { cosineSimilarity, topKSimilar } from "../src/vector-utils.js";

describe("cosineSimilarity", () => {
    it("should return 1 for identical vectors", () => {
        expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    });

    it("should return 0 for orthogonal vectors", () => {
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });

    it("should return -1 for opposite vectors", () => {
        expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    });

    it("should handle arbitrary vectors", () => {
        const sim = cosineSimilarity([1, 2, 3], [4, 5, 6]);
        expect(sim).toBeGreaterThan(0.97); // Nearly parallel
    });

    it("should return 0 for zero vectors", () => {
        expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });

    it("should throw for mismatched dimensions", () => {
        expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
            "dimension mismatch",
        );
    });
});

describe("topKSimilar", () => {
    it("should return top K items sorted by similarity", () => {
        const items = [
            { id: "a", embedding: [1, 0, 0] },
            { id: "b", embedding: [0, 1, 0] },
            { id: "c", embedding: [0.9, 0.1, 0] },
        ];

        const results = topKSimilar([1, 0, 0], items, 2);
        expect(results).toHaveLength(2);
        expect(results[0].id).toBe("a");
        expect(results[1].id).toBe("c");
    });

    it("should skip items without embeddings", () => {
        const items = [
            { id: "a", embedding: [1, 0] },
            { id: "b" }, // no embedding
            { id: "c", embedding: [0, 1] },
        ];

        const results = topKSimilar([1, 0], items, 5);
        expect(results).toHaveLength(2);
    });

    it("should return empty for empty input", () => {
        const results = topKSimilar([1, 0], [], 5);
        expect(results).toHaveLength(0);
    });
});
