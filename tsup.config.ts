import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/remark/index.ts", "src/components/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "react-dom", /^@theme\//, /^@docusaurus\//],
});
