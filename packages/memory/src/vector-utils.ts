// ============================================================================
// ZEN AI SDK — Vector Utilities (Zero Dependencies)
// Pure TypeScript cosine similarity for in-memory vector search.
// ============================================================================

/**
 * Compute the cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(
            `Vector dimension mismatch: ${a.length} vs ${b.length}`,
        );
    }
    if (a.length === 0) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;

    return dot / magnitude;
}

/**
 * Find the top-K most similar items by cosine similarity.
 * Returns items sorted by similarity (highest first).
 */
export function topKSimilar<T extends { embedding?: number[] }>(
    query: number[],
    items: T[],
    k: number,
): (T & { score: number })[] {
    const scored = items
        .filter((item): item is T & { embedding: number[] } => !!item.embedding)
        .map((item) => ({
            ...item,
            score: cosineSimilarity(query, item.embedding),
        }))
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, k);
}
