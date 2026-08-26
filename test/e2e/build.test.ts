import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startGitlabStub } from "./fixtures";

const siteDir = join(process.cwd(), "examples/site");

/**
 * The same site is built twice, so a Docusaurus 4 regression cannot hide behind
 * a passing Docusaurus 3 build (or the reverse).
 *
 * - `classic` is Docusaurus 3 defaults: webpack + Babel + cssnano. This is what
 *   every current user of the package runs.
 * - `v4` sets `future: { v4: true }` in examples/site/docusaurus.config.ts, which
 *   is the closest approximation of Docusaurus 4 available from a published
 *   release: Rspack, SWC, LightningCSS, CSS cascade layers, storage namespacing,
 *   and MDX-1 compatibility off.
 *
 * The non-obvious part: the variants differ in HTML MINIFIER as well as bundler.
 * `v4` turns on `faster.swcHtmlMinifier`, which replaces html-minifier-terser
 * with `@swc/html` — and that changes how the final HTML is ENCODED, not just
 * how it is built. See `attr()` below.
 *
 * Each variant builds into its own --out-dir so the two runs cannot collide.
 */
const VARIANTS = [
  { name: "classic", outDir: "build-classic", variantEnv: {} as NodeJS.ProcessEnv },
  { name: "v4", outDir: "build-v4", variantEnv: { DOCUSAURUS_FUTURE_V4: "1" } },
] as const;

// Remove the files the plugin generates into the example's `docs/generate/` folder
// (they sit alongside the committed `index.mdx`, which must be kept).
function cleanGeneratedPages() {
  const dir = join(siteDir, "docs", "generate");
  for (const f of ["repo.mdx", ".gitlab-generated", ".gitignore"]) {
    rmSync(join(dir, f), { force: true });
  }
}

/**
 * Builds a regex source fragment matching an HTML attribute whose value may or
 * may not be quoted.
 *
 * Under `future.v4`, `faster.swcHtmlMinifier` swaps html-minifier-terser for
 * `@swc/html`, which drops attribute quotes wherever HTML permits
 * (`href="repo"` -> `href=repo`). Docusaurus passes no quote-preservation option
 * on that path (see @docusaurus/bundler/lib/minifyHtml.js). The plugin's emitted
 * markup is byte-identical between variants — only the minifier's encoding
 * differs — so attribute assertions must accept both forms rather than being
 * pinned to one bundler's output.
 *
 * Returns a source fragment (not a RegExp) so multi-attribute matches compose:
 *   new RegExp(`${attr("class", "x")} ${attr("href", "y")}`)
 */
function attr(name: string, value: string): string {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `${name}="?${escaped}"?`;
}

/**
 * Runs the Docusaurus build ASYNCHRONOUSLY and awaits it. We must NOT use
 * execFileSync here: the GitLab stub server runs in this same (vitest) process,
 * and a synchronous child process would block the event loop so the stub could
 * never answer the build's API requests (gitbeaker would retry until timeout).
 *
 * `docusaurus build` is invoked directly rather than through the site's
 * `pnpm run build` script because the output location is a CLI flag
 * (`--out-dir`), not a docusaurus.config.ts field.
 */
function runBuild(env: NodeJS.ProcessEnv, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "docusaurus", "build", "--out-dir", outDir], {
      cwd: siteDir,
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`docusaurus build exited with code ${code}`)),
    );
  });
}

describe.each(VARIANTS)("e2e: docusaurus build ($name)", ({ outDir, variantEnv }) => {
  const out = (...parts: string[]) => join(siteDir, outDir, ...parts);
  let stub: Awaited<ReturnType<typeof startGitlabStub>>;

  beforeAll(async () => {
    stub = await startGitlabStub();
    rmSync(join(siteDir, outDir), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    rmSync(join(siteDir, "node_modules", ".cache", "@ebuildy/docusaurus-plugin-gitlab"), {
      recursive: true,
      force: true,
    });
    rmSync(join(siteDir, ".docusaurus"), { recursive: true, force: true });
    cleanGeneratedPages();
    await runBuild(
      { ...process.env, ...variantEnv, GITLAB_HOST: stub.url, GITLAB_TOKEN: "" },
      outDir,
    );
  }, 300_000);

  afterAll(async () => {
    await stub?.stop();
    rmSync(join(siteDir, outDir), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    cleanGeneratedPages();
  });

  it("bakes project info, releases, and issues into the static html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain("Repo");
    expect(html).toContain("v1.0");
    expect(html).toContain("A bug");
    expect(html).toContain("Readme body");
  });

  it("rewrites the README's relative links to absolute GitLab blob URLs", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain("/-/blob/main/CONTRIBUTING.md");
  });

  it("downloads and localizes README images into the gitlab-assets dir", () => {
    const assetDir = join(siteDir, "static", "gitlab-assets");
    const files = readdirSync(assetDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  });

  it("references the localized asset path from the built html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain("/gitlab-assets/");
  });

  it("merges sidebar README headings into the page's right-hand TOC", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // README headings appear as Docusaurus TOC links, not as an inline gitlab nav.
    expect(html).toContain("table-of-contents");
    // `attr()` because the v4 minifier emits `href=#install` without quotes.
    expect(html).toMatch(new RegExp(attr("href", "#install")));
    expect(html).toMatch(new RegExp(attr("href", "#usage")));
    expect(html).not.toContain("gitlab-md-toc");
    // README heading ids are present in the rendered body for the anchors to resolve.
    expect(html).toMatch(new RegExp(attr("id", "install")));
  });

  it("interleaves sidebar README headings after the page's own heading in document order", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // The page's own heading and the README headings all appear in the right-hand TOC...
    // `attr()` because the v4 minifier emits these hrefs without quotes.
    expect(html).toMatch(new RegExp(attr("href", "#overview")));
    expect(html).toMatch(new RegExp(attr("href", "#install")));
    // ...and the README headings come AFTER the page heading that precedes the component.
    expect(html.search(new RegExp(attr("href", "#overview")))).toBeLessThan(
      html.search(new RegExp(attr("href", "#install"))),
    );
  });

  it("bakes topics and labels into the static html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // topic explore link + count bubble (robust against Docusaurus's "Docs" navbar label)
    expect(html).toContain("/explore/projects/topics/docs");
    expect(html).toContain("gitlab-count-bubble");
    // project label (cards layout) with its description and issues link
    expect(html).toContain("gitlab-label-card");
    expect(html).toContain("label_name[]=bug");
    expect(html).toContain("New capability");
    // group label with the group issues link
    expect(html).toContain("/groups/my-group/-/issues?label_name[]=epic");
  });

  it("bakes user cards into the static html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // single card: identity + default profile sections
    expect(html).toContain("Jane Doe");
    // React SSR splits adjacent text/expression children ("@" and {username}) with an
    // <!-- --> comment marker, so assert on the link rather than the contiguous string.
    expect(html).toMatch(
      new RegExp(`${attr("class", "gitlab-user-username")} ${attr("href", "https://x/jdoe")}`),
    );
    expect(html).toContain("12 followers");
    expect(html).toContain("Member since");
    // members grid: both members, role badges, enriched org line
    expect(html).toContain("gitlab-user-cards");
    expect(html).toContain("Bob Martin");
    // role rendered as a badge, not just the word appearing anywhere on the page
    expect(html).toContain('gitlab-user-role">owner');
    expect(html).toContain("Senior Developer · ACME");
  });

  it("generates a child page nested under the declaring index page, with a card grid", () => {
    // The generator wrote the child page as a SIBLING of the declaring index page
    // (docs/generate/index.mdx), so Docusaurus nests it under that page.
    const childSource = join(siteDir, "docs", "generate", "repo.mdx");
    expect(readFileSync(childSource, "utf8")).toContain('<GitlabReadme project="group/repo" />');
    // No leftover subfolder from the old basePath model.
    expect(existsSync(join(siteDir, "docs", "generate", "projects"))).toBe(false);

    // The child page built at /generate/repo and baked in the README.
    const childHtml = readFileSync(out("generate", "repo", "index.html"), "utf8");
    expect(childHtml).toContain("Readme body");

    // The declaring page (/generate/) rendered the card grid linking to the child
    // via a bare slug, which resolves against the page's trailing-slash URL
    // (`/generate/` + `repo` → `/generate/repo`).
    const indexHtml = readFileSync(out("generate", "index.html"), "utf8");
    expect(indexHtml).toContain("gitlab-project-grid");
    expect(indexHtml).toMatch(
      new RegExp(`${attr("class", "gitlab-project-card")} ${attr("href", "repo")}`),
    );
    expect(indexHtml).toContain("Repo");
  });
});
