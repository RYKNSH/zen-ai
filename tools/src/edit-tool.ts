// ============================================================================
// ZEN AI SDK — Code Edit Tool
// Targeted search-and-replace editing (not full file overwrite).
// ============================================================================

import { readFile, writeFile } from "node:fs/promises";
import type { Tool, ToolResult } from "@zen-ai/core";

/** Tool for targeted code editing. */
export const codeEditTool: Tool = {
    name: "code_edit",
    description:
        "Edit a file by replacing a specific text pattern with new content. " +
        "More precise than file_write — only changes the targeted portion.",
    parameters: {
        type: "object",
        properties: {
            filePath: { type: "string", description: "Absolute path to the file to edit" },
            search: {
                type: "string",
                description: "Exact text to find (must match exactly, including whitespace)",
            },
            replace: {
                type: "string",
                description: "Text to replace the search match with",
            },
        },
        required: ["filePath", "search", "replace"],
    },
    async execute(params): Promise<ToolResult> {
        try {
            const filePath = params.filePath as string;
            const search = params.search as string;
            const replace = params.replace as string;

            const content = await readFile(filePath, "utf-8");

            // Check if search pattern exists
            const index = content.indexOf(search);
            if (index === -1) {
                return {
                    success: false,
                    output: null,
                    error: `Search pattern not found in ${filePath}. The text must match exactly.`,
                };
            }

            // Check for multiple occurrences
            const secondIndex = content.indexOf(search, index + 1);
            if (secondIndex !== -1) {
                return {
                    success: false,
                    output: null,
                    error: `Multiple occurrences found (${countOccurrences(content, search)}). ` +
                        `Please use a more specific search pattern.`,
                };
            }

            // Apply the edit
            const newContent = content.slice(0, index) + replace + content.slice(index + search.length);
            await writeFile(filePath, newContent, "utf-8");

            return {
                success: true,
                output: `Edited ${filePath}: replaced ${search.length} chars at position ${index}`,
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

function countOccurrences(text: string, search: string): number {
    let count = 0;
    let pos = 0;
    while ((pos = text.indexOf(search, pos)) !== -1) {
        count++;
        pos += 1;
    }
    return count;
}
