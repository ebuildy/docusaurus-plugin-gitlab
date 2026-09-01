import type { PluginConfig, PluginModule } from "@docusaurus/types";
import gitlabPlugin from "./index.js";

// Compile-time conformance guard for the documented registration form,
//
//   plugins: [[gitlabPlugin, gitlabOptions]]
//
// which Docusaurus type-checks against `PluginConfig` (see README.md and
// examples/gitlab). `PluginModule` pins the RETURN type too, so a widened
// `mergeStrategy` — the `as const` in ./index.js — fails here as well.
//
// `@docusaurus/types` is a devDependency and `tsconfig.build.json` excludes
// `*.test.ts`, so this import is checked by `pnpm run typecheck` without ever
// reaching `dist/`. That matters: a `.d.ts` importing it would not resolve for
// pnpm consumers, who do not get the package hoisted — examples/gitlab has to
// declare it explicitly.
//
// No runtime assertions: `passWithNoTests` (vitest.config.ts) makes that a pass,
// and ./index.test.ts already covers the runtime behaviour.

gitlabPlugin satisfies PluginModule;
[[gitlabPlugin, { host: "https://gitlab.com" }]] satisfies PluginConfig[];
