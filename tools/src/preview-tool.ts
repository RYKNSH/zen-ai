// ============================================================================
// ZEN AI SDK — Preview Deploy Tool
// Deploys HTML/JS/CSS to a local preview server and returns a playable URL.
// "Show, don't tell."
// ============================================================================

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { Tool, ToolResult } from "@zen-ai/core";

// ---------------------------------------------------------------------------
// Preview Server
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
};

let previewServer: Server | null = null;
let previewPort = 3456;

/**
 * Start the preview HTTP server.
 * Serves static files from the preview directory.
 */
export function startPreviewServer(
    previewDir: string,
    port: number = 3456,
): Promise<number> {
    previewPort = port;

    return new Promise((resolve, reject) => {
        if (previewServer) {
            resolve(port);
            return;
        }

        previewServer = createServer(async (req, res) => {
            try {
                // Parse URL path
                const urlPath = decodeURIComponent(req.url ?? "/");
                let filePath = join(previewDir, urlPath);

                // Default to index.html
                if (filePath.endsWith("/")) {
                    filePath = join(filePath, "index.html");
                }

                // Security: prevent path traversal
                if (!filePath.startsWith(previewDir)) {
                    res.writeHead(403);
                    res.end("Forbidden");
                    return;
                }

                // Check if file exists
                if (!existsSync(filePath)) {
                    res.writeHead(404);
                    res.end("Not Found");
                    return;
                }

                // Read and serve
                const content = await readFile(filePath);
                const ext = extname(filePath);
                const mime = MIME_TYPES[ext] ?? "application/octet-stream";

                res.writeHead(200, {
                    "Content-Type": mime,
                    "Access-Control-Allow-Origin": "*",
                });
                res.end(content);
            } catch {
                res.writeHead(500);
                res.end("Internal Server Error");
            }
        });

        previewServer.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                // Try next port
                previewPort++;
                previewServer?.close();
                previewServer = null;
                startPreviewServer(previewDir, previewPort).then(resolve).catch(reject);
            } else {
                reject(err);
            }
        });

        previewServer.listen(port, () => {
            console.log(`🎮 Preview server running at http://localhost:${port}`);
            resolve(port);
        });
    });
}

// ---------------------------------------------------------------------------
// Preview Deploy Tool
// ---------------------------------------------------------------------------

/**
 * Create a preview deploy tool.
 * ZENNY uses this to deploy HTML apps and return playable URLs.
 *
 * @param previewDir - Base directory for preview files
 * @param baseUrl - Base URL for the preview server (default: http://localhost:3456)
 */
export function createPreviewTool(
    previewDir: string,
    baseUrl?: string,
): Tool {
    return {
        name: "preview_deploy",
        description:
            "Deploy an HTML/CSS/JS app to the preview server and return a playable URL. " +
            "Use this INSTEAD of just sending code in chat. " +
            "When the user asks you to make a game or web app, write the code and deploy it here. " +
            "The user can click the URL to play/view it immediately in their browser.",
        parameters: {
            type: "object",
            properties: {
                project_name: {
                    type: "string",
                    description: "Short name for the project in kebab-case (e.g. 'tetris', 'janken-game')",
                },
                html: {
                    type: "string",
                    description: "Complete HTML content for index.html. Should be a self-contained single-file app with embedded CSS and JavaScript.",
                },
                additional_files: {
                    type: "string",
                    description: "Optional JSON object mapping file paths to content, e.g. {\"style.css\": \"body{}\", \"app.js\": \"...\"}",
                },
            },
            required: ["project_name", "html"],
        },
        async execute(params): Promise<ToolResult> {
            try {
                const projectName = params.project_name as string;
                const html = params.html as string;
                const additionalFilesStr = (params.additional_files as string) || "{}";

                // Validate project name
                if (!/^[a-z0-9][a-z0-9-]*$/.test(projectName)) {
                    return {
                        success: false,
                        output: null,
                        error: "Project name must be kebab-case (lowercase, numbers, hyphens).",
                    };
                }

                // Create project directory
                const projectDir = join(previewDir, projectName);
                if (!existsSync(projectDir)) {
                    await mkdir(projectDir, { recursive: true });
                }

                // Write index.html
                await writeFile(join(projectDir, "index.html"), html, "utf-8");

                // Write additional files
                try {
                    const additionalFiles = JSON.parse(additionalFilesStr);
                    for (const [fileName, content] of Object.entries(additionalFiles)) {
                        if (typeof content === "string") {
                            const filePath = join(projectDir, fileName);
                            // Security: prevent path traversal
                            if (filePath.startsWith(projectDir)) {
                                await writeFile(filePath, content, "utf-8");
                            }
                        }
                    }
                } catch {
                    // Ignore malformed additional_files
                }

                const url = `${baseUrl ?? `http://localhost:${previewPort}`}/${projectName}/`;

                return {
                    success: true,
                    output: `Deployed! Play here: ${url}`,
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
