import type { Tool } from "@zen-ai/core";
/**
 * Create a shell execution tool.
 *
 * ⚠️ This tool is DISABLED by default. Pass `unsafe: true` to enable.
 * Shell execution carries inherent security risks — use only in
 * trusted environments.
 */
export declare function createShellTool(options?: {
    unsafe?: boolean;
}): Tool;
//# sourceMappingURL=shell-tool.d.ts.map