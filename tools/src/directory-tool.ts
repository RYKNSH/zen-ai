// ============================================================================
// ZEN AI SDK — Directory Tool
// List directory contents for project structure awareness.
// ============================================================================

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Tool, ToolResult } from "@zen-ai/core";

interface DirEntry {
    name: string;
    type: "file" | "directory";
    size?: number;
}

/** Tool for listing directory contents. */
export const directoryListTool: Tool = {
    name: "directory_list",
    description:
        "List files and directories at the given path. Returns name, type, and size for each entry.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Absolute path to the directory" },
            recursive: {
                type: "string",
                description: "If 'true', list recursively (default: 'false')",
            },
            maxDepth: {
                type: "string",
                description: "Max recursion depth (default: '3')",
            },
        },
        required: ["path"],
    },
    async execute(params): Promise<ToolResult> {
        try {
            const dirPath = params.path as string;
            const recursive = (params.recursive as string) === "true";
            const maxDepth = parseInt((params.maxDepth as string) ?? "3", 10);

            const entries = await listDir(dirPath, recursive, maxDepth, 0);

            return {
                success: true,
                output: entries,
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

async function listDir(
    dirPath: string,
    recursive: boolean,
    maxDepth: number,
    currentDepth: number,
): Promise<DirEntry[]> {
    const entries: DirEntry[] = [];
    const items = await readdir(dirPath);

    // Cap at 200 entries to prevent overwhelming output
    let count = 0;
    const MAX_ENTRIES = 200;

    for (const item of items) {
        if (count >= MAX_ENTRIES) break;
        // Skip hidden files and common noise
        if (item.startsWith(".") || item === "node_modules" || item === "dist") continue;

        const fullPath = join(dirPath, item);
        try {
            const s = await stat(fullPath);
            const entry: DirEntry = {
                name: item,
                type: s.isDirectory() ? "directory" : "file",
            };
            if (s.isFile()) entry.size = s.size;
            entries.push(entry);
            count++;

            if (recursive && s.isDirectory() && currentDepth < maxDepth) {
                const children = await listDir(fullPath, true, maxDepth, currentDepth + 1);
                for (const child of children) {
                    if (count >= MAX_ENTRIES) break;
                    entries.push({ ...child, name: `${item}/${child.name}` });
                    count++;
                }
            }
        } catch {
            // Skip inaccessible entries
        }
    }

    return entries;
}
