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
    environment: "node",
    environmentMatchGlobs: [["**/components/**", "jsdom"]],
    setupFiles: ["test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
  },
});
