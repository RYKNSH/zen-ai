// ============================================================================
// ZEN AI SDK — Logger
// Structured logging for all agent operations.
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";
import type { ZenAgent } from "./zen-agent.js";

/** Log level. */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** A single log entry. */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    event: string;
    data?: Record<string, unknown>;
}

/** Logger configuration. */
export interface LoggerOptions {
    /** File path for log output. If omitted, logs go to console only. */
    filePath?: string;
    /** Minimum log level. Default: "INFO". */
    minLevel?: LogLevel;
    /** Also output to console. Default: true. */
    console?: boolean;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

/**
 * Logger — Structured logging for ZEN AI agents.
 *
 * Attaches to agent events and logs all operations.
 *
 * Usage:
 * ```ts
 * const logger = new Logger({ filePath: "./agent.log" });
 * logger.attach(agent);
 * ```
 */
export class Logger {
    private filePath?: string;
    private minLevel: LogLevel;
    private useConsole: boolean;
    private stream?: fs.WriteStream;

    constructor(options: LoggerOptions = {}) {
        this.minLevel = options.minLevel ?? "INFO";
        this.useConsole = options.console ?? true;

        if (options.filePath) {
            this.filePath = path.resolve(options.filePath);
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.stream = fs.createWriteStream(this.filePath, { flags: "a" });
        }
    }

    /** Log a message. */
    log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            ...(data ? { data } : {}),
        };

        const line = JSON.stringify(entry);

        if (this.stream) {
            this.stream.write(line + "\n");
        }

        if (this.useConsole) {
            const prefix = level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : "🧘";
            console.log(`${prefix} [${level}] ${event}`, data ? JSON.stringify(data) : "");
        }
    }

    /** Attach to a ZenAgent's events for automatic logging. */
    attach(agent: ZenAgent): void {
        agent.on("agent:start", ({ goal }) => {
            this.log("INFO", "agent:start", { goal: goal.description });
        });

        agent.on("action:start", ({ action, step }) => {
            this.log("INFO", "action:start", {
                tool: action.toolName,
                step,
                reasoning: action.reasoning,
            });
        });

        agent.on("action:complete", ({ action, result, step }) => {
            this.log(
                result.success ? "INFO" : "WARN",
                "action:complete",
                {
                    tool: action.toolName,
                    step,
                    success: result.success,
                    error: result.error,
                },
            );
        });

        agent.on("milestone:reached", ({ milestoneId, resources }) => {
            this.log("INFO", "milestone:reached", { milestoneId, resources });
        });

        agent.on("milestone:failed", ({ milestoneId, error }) => {
            this.log("ERROR", "milestone:failed", {
                milestoneId,
                error: error.message,
            });
        });

        agent.on("failure:recorded", ({ proverb, condition }) => {
            this.log("WARN", "failure:recorded", { proverb, condition });
        });

        agent.on("context:reset", ({ previousMilestone, nextMilestone }) => {
            this.log("INFO", "context:reset", {
                previousMilestone,
                nextMilestone,
            });
        });

        agent.on("agent:complete", ({ goal, totalSteps }) => {
            this.log("INFO", "agent:complete", {
                goal: goal.description,
                totalSteps,
            });
        });

        agent.on("agent:error", ({ error, step }) => {
            this.log("ERROR", "agent:error", {
                error: error.message,
                step,
            });
        });
    }

    /** Close the log stream. */
    close(): void {
        this.stream?.end();
    }
}
