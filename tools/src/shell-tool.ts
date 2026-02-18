// ============================================================================
// ZEN AI SDK — Shell Tool
// Execute shell commands. DISABLED BY DEFAULT for safety.
// ============================================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "@zen-ai/core";

const execAsync = promisify(exec);

/** Maximum execution time for shell commands (30 seconds). */
const SHELL_TIMEOUT = 30_000;

/**
 * Create a shell execution tool.
 *
 * ⚠️ This tool is DISABLED by default. Pass `unsafe: true` to enable.
 * Shell execution carries inherent security risks — use only in
 * trusted environments.
 */
export function createShellTool(options: { unsafe?: boolean } = {}): Tool {
    return {
        name: "shell_exec",
        description:
            "Execute a shell command and return stdout/stderr. Use with caution.",
        parameters: {
            type: "object",
            properties: {
                command: { type: "string", description: "The shell command to execute" },
                cwd: {
                    type: "string",
                    description: "Working directory (optional, defaults to process.cwd())",
                },
            },
            required: ["command"],
        },
        async execute(params): Promise<ToolResult> {
            if (!options.unsafe) {
                return {
                    success: false,
                    output: null,
                    error:
                        "Shell tool is disabled for safety. Initialize with createShellTool({ unsafe: true }) to enable.",
                };
            }

            try {
                const { stdout, stderr } = await execAsync(params.command as string, {
                    cwd: (params.cwd as string) ?? process.cwd(),
                    timeout: SHELL_TIMEOUT,
                    maxBuffer: 1024 * 1024, // 1MB
                });

                return {
                    success: true,
                    output: { stdout: stdout.trim(), stderr: stderr.trim() },
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
}
