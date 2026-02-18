// ============================================================================
// ZEN AI SDK — File Tool
// Read and write files on the local filesystem.
// ============================================================================

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Tool, ToolResult } from "@zen-ai/core";

/** Tool for reading files. */
export const fileReadTool: Tool = {
    name: "file_read",
    description: "Read the contents of a file at the given path.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Absolute path to the file to read" },
        },
        required: ["path"],
    },
    async execute(params): Promise<ToolResult> {
        try {
            const content = await readFile(params.path as string, "utf-8");
            return { success: true, output: content };
        } catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};

/** Tool for writing files. */
export const fileWriteTool: Tool = {
    name: "file_write",
    description:
        "Write content to a file at the given path. Creates parent directories if needed.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Absolute path to write to" },
            content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
    },
    async execute(params): Promise<ToolResult> {
        try {
            const filePath = params.path as string;
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, params.content as string, "utf-8");
            return { success: true, output: `Written to ${filePath}` };
        } catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
