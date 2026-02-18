import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fileReadTool, fileWriteTool } from "../src/file-tool.js";
import { httpTool } from "../src/http-tool.js";
import { createShellTool } from "../src/shell-tool.js";
import { writeFile, unlink, mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), "zen-ai-test-" + Date.now());
const TEST_FILE = join(TEST_DIR, "test.txt");

describe("fileReadTool", () => {
    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });
        await writeFile(TEST_FILE, "hello world", "utf-8");
    });

    afterEach(async () => {
        try {
            await unlink(TEST_FILE);
            await rmdir(TEST_DIR);
        } catch { }
    });

    it("should have correct metadata", () => {
        expect(fileReadTool.name).toBe("file_read");
        expect(fileReadTool.parameters.required).toContain("path");
    });

    it("should read an existing file", async () => {
        const result = await fileReadTool.execute({ path: TEST_FILE });
        expect(result.success).toBe(true);
        expect(result.output).toBe("hello world");
    });

    it("should return error for non-existent file", async () => {
        const result = await fileReadTool.execute({ path: "/nonexistent/file.txt" });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});

describe("fileWriteTool", () => {
    const WRITE_FILE = join(TEST_DIR, "output.txt");

    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });
    });

    afterEach(async () => {
        try {
            await unlink(WRITE_FILE);
            await rmdir(TEST_DIR);
        } catch { }
    });

    it("should write a file", async () => {
        const result = await fileWriteTool.execute({
            path: WRITE_FILE,
            content: "test content",
        });
        expect(result.success).toBe(true);

        // Verify by reading
        const readResult = await fileReadTool.execute({ path: WRITE_FILE });
        expect(readResult.output).toBe("test content");
    });

    it("should create parent directories", async () => {
        const deepFile = join(TEST_DIR, "deep", "nested", "file.txt");
        const result = await fileWriteTool.execute({
            path: deepFile,
            content: "deep content",
        });
        expect(result.success).toBe(true);
    });
});

describe("createShellTool", () => {
    it("should be disabled by default", async () => {
        const tool = createShellTool();
        const result = await tool.execute({ command: "echo hello" });
        expect(result.success).toBe(false);
        expect(result.error).toContain("disabled");
    });

    it("should execute when unsafe: true", async () => {
        const tool = createShellTool({ unsafe: true });
        const result = await tool.execute({ command: "echo hello" });
        expect(result.success).toBe(true);
        expect((result.output as any).stdout).toBe("hello");
    });

    it("should handle command errors", async () => {
        const tool = createShellTool({ unsafe: true });
        const result = await tool.execute({ command: "exit 1" });
        expect(result.success).toBe(false);
    });
});

describe("httpTool", () => {
    it("should have correct metadata", () => {
        expect(httpTool.name).toBe("http_request");
        expect(httpTool.parameters.required).toContain("url");
    });

    it("should handle invalid URLs", async () => {
        const result = await httpTool.execute({ url: "not-a-url" });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});
