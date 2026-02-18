import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["packages/**/__tests__/**/*.test.ts", "tools/**/__tests__/**/*.test.ts"],
        coverage: {
            provider: "v8",
            include: ["packages/*/src/**/*.ts", "tools/src/**/*.ts"],
            exclude: [
                "**/__tests__/**",
                "**/*.d.ts",
                "packages/discord-bot/**",
                "packages/cli/**",
                "**/index.ts",
                "**/types.ts",
            ],
            thresholds: {
                statements: 80,
                branches: 60,
                functions: 80,
                lines: 80,
            },
        },
    },
});
