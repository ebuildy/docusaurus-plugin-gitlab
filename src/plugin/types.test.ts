import type { LoadContext, Plugin, PluginConfig, PluginModule } from "@docusaurus/types";
import { describe, it, expect } from "vitest";
import gitlabPlugin from "./index.js";

// Compile-time conformance guard. `@docusaurus/types` is a devDependency only,
// and `tsconfig.build.json` excludes `*.test.ts`, so this import is checked by
// `pnpm run typecheck` without ever reaching `dist/` — a `.d.ts` that imported
// it would fail to resolve for pnpm consumers, who do not get @docusaurus/types
// hoisted into their node_modules (examples/gitlab is the proof).
//
// The assertions below are the contract Docusaurus actually applies to a plugin
// passed as a FUNCTION — the form README.md and examples/gitlab document:
//
//   plugins: [[gitlabPlugin, gitlabOptions]]
//
// If any of them stops compiling, that usage breaks for every TypeScript site.

// The whole module must be a PluginModule: `(context: LoadContext, options: unknown)`.
// Note `options` is `unknown`, not our PluginOptions — a narrower parameter type
// fails contravariantly. Docusaurus's own plugins (e.g. @docusaurus/plugin-sitemap)
// declare `options: PluginOptions` and are NOT assignable here; we deliberately
// hold a stricter line so the documented function form type-checks.
const _module: PluginModule = gitlabPlugin;

// The returned object must be a valid Plugin. Without this, the return shape is
// inferred and never compared to anything — which is how `mergeStrategy` came to
// widen to `string` and silently violate ConfigureWebpackResult.
async function _returnsPlugin(context: LoadContext): Promise<Plugin> {
  return await gitlabPlugin(context, {});
}

// And the documented registration form must type-check uncast.
const _config: PluginConfig[] = [[gitlabPlugin, { host: "https://gitlab.com" }]];

void _module;
void _returnsPlugin;
void _config;

describe("gitlabPlugin Docusaurus contract", () => {
  it("declares mergeStrategy with a literal CustomizeRuleString, not a widened string", async () => {
    // The runtime half of the guard above: `as const` on the "append" literal is
    // what keeps configureWebpack's result assignable to ConfigureWebpackResult.
    const plugin = await gitlabPlugin({ siteDir: "/site" } as never, {
      host: "https://gitlab.example.com",
      cache: false,
    } as never);
    const wp = plugin.configureWebpack!({} as never, false, {} as never, undefined);
    expect(wp).toMatchObject({ mergeStrategy: { "module.rules": "append" } });
  });
});
