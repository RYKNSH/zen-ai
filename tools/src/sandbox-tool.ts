// ============================================================================
// ZEN AI SDK — Sandbox Tool
// Deploy static sites via localtunnel
// ============================================================================

import localtunnel from "localtunnel";
import handler from "serve-handler";
import http from "node:http";
import type { Tool, ToolResult } from "@zen-ai/core";

// Keep track of active tunnels to prevent garbage collection or to allow stopping
const activeTunnels: Array<{ server: http.Server; tunnel: localtunnel.Tunnel }> =
    [];

/** Tool for starting a sandbox server. */
export const startSandboxTool: Tool = {
    name: "start_sandbox",
    description:
        "Start a public web server for a local directory. Returns a public URL (https://...). use this to display web artifacts (HTML/JS) to the user.",
    parameters: {
        type: "object",
        properties: {
            directory: {
                type: "string",
                description:
                    "Absolute path to the directory to serve (e.g. where index.html is)",
            },
        },
        required: ["directory"],
    },
    async execute(params: Record<string, unknown>): Promise<ToolResult> {
        try {
            const dir = params.directory as string;
            // Random port between 3000-4000
            const port = 3000 + Math.floor(Math.random() * 1000);

            const server = http.createServer((req, res) => {
                return handler(req, res, { public: dir });
            });

            server.listen(port);

            const tunnel = await localtunnel({ port });

            activeTunnels.push({ server, tunnel });

            const url = tunnel.url;
            console.log(`🌍 Sandbox started: ${url} -> ${dir}`);

            return {
                success: true,
                output: `Sandbox deployed successfully!\nURL: ${url}\n(Note: The server will shut down when the bot restarts)`,
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
