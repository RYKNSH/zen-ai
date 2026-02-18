// ============================================================================
// ZEN AI SDK — Logger Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Logger } from "../src/logger.js";
import type { LogEntry } from "../src/logger.js";

describe("Logger", () => {
    let tmpDir: string;
    let logPath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zen-log-test-"));
        logPath = path.join(tmpDir, "test.log");
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("should log to file", async () => {
        const logger = new Logger({
            filePath: logPath,
            console: false,
        });

        logger.log("INFO", "test-event", { key: "value" });
        logger.close();

        // Wait for stream flush
        await new Promise((r) => setTimeout(r, 100));

        const content = fs.readFileSync(logPath, "utf-8").trim();
        const entry: LogEntry = JSON.parse(content);

        expect(entry.level).toBe("INFO");
        expect(entry.event).toBe("test-event");
        expect(entry.data?.key).toBe("value");
        expect(entry.timestamp).toBeDefined();
    });

    it("should respect minimum log level", async () => {
        const logger = new Logger({
            filePath: logPath,
            minLevel: "WARN",
            console: false,
        });

        logger.log("DEBUG", "debug-event");
        logger.log("INFO", "info-event");
        logger.log("WARN", "warn-event");
        logger.log("ERROR", "error-event");
        logger.close();

        await new Promise((r) => setTimeout(r, 100));

        const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
        expect(lines).toHaveLength(2);

        const entry1: LogEntry = JSON.parse(lines[0]);
        const entry2: LogEntry = JSON.parse(lines[1]);
        expect(entry1.event).toBe("warn-event");
        expect(entry2.event).toBe("error-event");
    });

    it("should log to console", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });

        const logger = new Logger({ console: true });
        logger.log("INFO", "console-test");

        expect(consoleSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy.mock.calls[0][0]).toContain("[INFO]");

        consoleSpy.mockRestore();
    });

    it("should log ERROR with ❌ prefix", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });

        const logger = new Logger({ console: true });
        logger.log("ERROR", "error-test");

        expect(consoleSpy.mock.calls[0][0]).toContain("❌");

        consoleSpy.mockRestore();
    });

    it("should log WARN with ⚠️ prefix", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });

        const logger = new Logger({ console: true });
        logger.log("WARN", "warn-test");

        expect(consoleSpy.mock.calls[0][0]).toContain("⚠️");

        consoleSpy.mockRestore();
    });

    it("should create directory for log file", async () => {
        const deepPath = path.join(tmpDir, "deep", "logs", "test.log");
        const logger = new Logger({
            filePath: deepPath,
            console: false,
        });

        logger.log("INFO", "deep-test");
        logger.close();

        await new Promise((r) => setTimeout(r, 100));

        expect(fs.existsSync(deepPath)).toBe(true);
    });

    it("should work without file path (console only)", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });

        const logger = new Logger({ console: true });
        logger.log("INFO", "no-file-test");

        expect(consoleSpy).toHaveBeenCalledTimes(1);
        consoleSpy.mockRestore();
    });

    it("should omit data from log entry when not provided", async () => {
        const logger = new Logger({
            filePath: logPath,
            console: false,
        });

        logger.log("INFO", "no-data-event");
        logger.close();

        await new Promise((r) => setTimeout(r, 100));

        const content = fs.readFileSync(logPath, "utf-8").trim();
        const entry: LogEntry = JSON.parse(content);

        expect(entry.data).toBeUndefined();
    });
});
