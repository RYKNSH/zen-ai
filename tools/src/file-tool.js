// ============================================================================
// ZEN AI SDK — File Tool
// Read and write files on the local filesystem.
// ============================================================================
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
/** Tool for reading files. */
export const fileReadTool = {
    name: "file_read",
    description: "Read the contents of a file at the given path.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Absolute path to the file to read" },
        },
        required: ["path"],
    },
    async execute(params) {
        try {
            const content = await readFile(params.path, "utf-8");
            return { success: true, output: content };
        }
        catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
/** Tool for writing files. */
export const fileWriteTool = {
    name: "file_write",
    description: "Write content to a file at the given path. Creates parent directories if needed.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Absolute path to write to" },
            content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
    },
    async execute(params) {
        try {
            const filePath = params.path;
            await mkdir(dirname(filePath), { recursive: true });
            await writeFile(filePath, params.content, "utf-8");
            return { success: true, output: `Written to ${filePath}` };
        }
        catch (error) {
            return {
                success: false,
                output: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
};
//# sourceMappingURL=file-tool.js.map