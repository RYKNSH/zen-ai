// ============================================================================
// ZEN AI SDK — Project Scaffold Tool
// Generate new projects from templates.
// ============================================================================

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync } from "node:fs";
import type { Tool, ToolResult } from "@zen-ai/core";

const execAsync = promisify(exec);

const TEMPLATES: Record<string, { command: string; description: string }> = {
    nextjs: {
        command: "npx -y create-next-app@latest {path} --ts --eslint --app --src-dir --no-tailwind --import-alias '@/*'",
        description: "Next.js (TypeScript, App Router)",
    },
    vite: {
        command: "npx -y create-vite@latest {path} -- --template react-ts",
        description: "Vite + React (TypeScript)",
    },
    node: {
        command: "mkdir -p {path} && cd {path} && npm init -y && npx -y tsc --init",
        description: "Node.js (TypeScript)",
    },
    python: {
        command: "mkdir -p {path} && cd {path} && python3 -m venv venv && touch main.py requirements.txt",
        description: "Python (venv)",
    },
    html: {
        command: "mkdir -p {path} && cd {path} && touch index.html style.css script.js",
        description: "Static HTML/CSS/JS",
    },
};

/** Tool for scaffolding new projects. */
export const projectScaffoldTool: Tool = {
    name: "project_scaffold",
    description:
        "Create a new project from a template. " +
        `Available templates: ${Object.entries(TEMPLATES).map(([k, v]) => `${k} (${v.description})`).join(", ")}`,
    parameters: {
        type: "object",
        properties: {
            template: {
                type: "string",
                description: `Template name: ${Object.keys(TEMPLATES).join(", ")}`,
            },
            name: { type: "string", description: "Project name" },
            path: {
                type: "string",
                description: "Absolute path where the project should be created",
            },
        },
        required: ["template", "name", "path"],
    },
    async execute(params): Promise<ToolResult> {
        try {
            const template = params.template as string;
            const projectPath = params.path as string;

            if (!TEMPLATES[template]) {
                return {
                    success: false,
                    output: null,
                    error: `Unknown template "${template}". Available: ${Object.keys(TEMPLATES).join(", ")}`,
                };
            }

            if (existsSync(projectPath)) {
                return {
                    success: false,
                    output: null,
                    error: `Path already exists: ${projectPath}`,
                };
            }

            const command = TEMPLATES[template].command.replace(/\{path\}/g, projectPath);

            const { stdout, stderr } = await execAsync(command, {
                timeout: 120_000, // 2 minutes
                maxBuffer: 5 * 1024 * 1024,
            });

            return {
                success: true,
                output: {
                    template,
                    path: projectPath,
                    stdout: stdout.trim().slice(-500), // Last 500 chars
                    stderr: stderr.trim().slice(-200),
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
