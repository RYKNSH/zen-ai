// ============================================================================
// ZEN AI SDK — Shell Tool (Sandboxed)
// Execute shell commands with allowlist-based safety.
// ============================================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "@zen-ai/core";

const execAsync = promisify(exec);

/** Maximum execution time for shell commands (30 seconds). */
const SHELL_TIMEOUT = 30_000;

/** Allowlisted command prefixes. Only these commands can be executed. */
const ALLOWED_PREFIXES = [
    "npm ", "npx ", "pnpm ", "node ", "git ", "curl ", "cat ", "ls ", "echo ",
    "mkdir ", "cp ", "mv ", "head ", "tail ", "wc ", "grep ", "find ", "which ",
    "python ", "python3 ", "pip ", "pip3 ",
    "tsc", "prettier ", "eslint ",
];

/** Blocked patterns (even if prefix is allowed). */
const BLOCKED_PATTERNS = [
    /rm\s+-rf\s+\//,
    /sudo\s/,
    /chmod\s+777/,
    />\s*\/dev\//,
    /\|\s*sh\b/,
    /\|\s*bash\b/,
    /eval\s/,
    /curl.*\|\s*sh/,
    /curl.*\|\s*bash/,
];

function isCommandSafe(command: string): { safe: boolean; reason?: string } {
    const trimmed = command.trim();

    // Check blocked patterns first
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { safe: false, reason: `Blocked pattern detected: ${pattern}` };
        }
    }

    // Check allowlist
    const allowed = ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    if (!allowed) {
        return {
            safe: false,
            reason: `Command not in allowlist. Allowed: ${ALLOWED_PREFIXES.map((p) => p.trim()).join(", ")}`,
        };
    }

    return { safe: true };
}

/**
 * Create a sandboxed shell tool with allowlist-based safety.
 *
 * @param options.mode - "sandboxed" (default, allowlist) or "unsafe" (no restrictions)
 */
export function createShellTool(
    options: { unsafe?: boolean; mode?: "sandboxed" | "unsafe" } = {},
): Tool {
    const mode = options.mode ?? (options.unsafe ? "unsafe" : "sandboxed");

    return {
        name: "shell_exec",
        description:
            mode === "sandboxed"
                ? "Execute a shell command (sandboxed: npm, node, git, curl, python, etc.). " +
                "Cannot run destructive commands like rm -rf or sudo."
                : "Execute any shell command. Use with caution.",
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
            const command = params.command as string;

            // Safety check in sandboxed mode
            if (mode === "sandboxed") {
                const check = isCommandSafe(command);
                if (!check.safe) {
                    return {
                        success: false,
                        output: null,
                        error: `Command blocked: ${check.reason}`,
                    };
                }
            }

            try {
                const { stdout, stderr } = await execAsync(command, {
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
