// ============================================================================
// ZEN AI SDK — Code Search Tool
// Search for patterns in code files (grep-like).
// ============================================================================

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Tool, ToolResult } from "@zen-ai/core";

interface SearchMatch {
    file: string;
    line: number;
    content: string;
}

// File extensions to search (skip binary files)
const SEARCHABLE_EXTENSIONS = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rb", ".rs", ".go", ".java", ".c", ".cpp", ".h",
    ".html", ".css", ".scss", ".json", ".yaml", ".yml", ".toml",
    ".md", ".txt", ".sh", ".bash", ".zsh",
    ".sql", ".graphql", ".prisma",
    ".env", ".gitignore", ".dockerfile",
    ".svelte", ".vue", ".astro",
]);

/** Tool for searching code by pattern. */
export const codeSearchTool: Tool = {
    name: "code_search",
    description:
        "Search for a text pattern in files within a directory. Returns matching lines with file paths and line numbers.",
    parameters: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Text or regex pattern to search for" },
            path: { type: "string", description: "Directory to search in" },
            regex: {
                type: "string",
                description: "If 'true', treat pattern as regex (default: 'false')",
            },
        },
        required: ["pattern", "path"],
    },
    async execute(params): Promise<ToolResult> {
        try {
            const pattern = params.pattern as string;
            const searchPath = params.path as string;
            const useRegex = (params.regex as string) === "true";

            const regex = useRegex
                ? new RegExp(pattern, "gi")
                : null;

            const matches: SearchMatch[] = [];
            await searchDir(searchPath, pattern, regex, matches, 0);

            return {
                success: true,
                output: {
                    matches: matches.slice(0, 50), // Cap at 50 results
                    totalMatches: matches.length,
                    truncated: matches.length > 50,
                },
            };
        } catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};

async function searchDir(
    dirPath: string,
    pattern: string,
    regex: RegExp | null,
    matches: SearchMatch[],
    depth: number,
): Promise<void> {
    if (depth > 5 || matches.length >= 100) return;

    let items: string[];
    try {
        items = await readdir(dirPath);
    } catch {
        return;
    }

    for (const item of items) {
        if (matches.length >= 100) return;
        if (item.startsWith(".") || item === "node_modules" || item === "dist" || item === "coverage") continue;

        const fullPath = join(dirPath, item);
        try {
            const s = await stat(fullPath);

            if (s.isDirectory()) {
                await searchDir(fullPath, pattern, regex, matches, depth + 1);
            } else if (s.isFile() && SEARCHABLE_EXTENSIONS.has(extname(item).toLowerCase())) {
                // Skip large files (>500KB)
                if (s.size > 512_000) continue;

                const content = await readFile(fullPath, "utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const isMatch = regex ? regex.test(line) : line.includes(pattern);
                    if (regex) regex.lastIndex = 0; // Reset regex state

                    if (isMatch) {
                        matches.push({
                            file: fullPath,
                            line: i + 1,
                            content: line.trim().slice(0, 200),
                        });
                        if (matches.length >= 100) return;
                    }
                }
            }
        } catch {
            // Skip inaccessible
        }
    }
}
