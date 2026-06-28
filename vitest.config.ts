import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@theme/CodeBlock": fileURLToPath(
        new URL("./test/theme-codeblock-stub.tsx", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    passWithNoTests: true,
    setupFiles: ["test/setup.ts"],
    // `environmentMatchGlobs` was removed in Vitest 3+. Use projects to run
    // component tests under jsdom and everything else under node.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
          exclude: ["src/components/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/components/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
