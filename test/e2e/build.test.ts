import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startGitlabStub } from "./fixtures";

const siteDir = join(process.cwd(), "examples/site");
let stub: Awaited<ReturnType<typeof startGitlabStub>>;

// Remove the files the plugin generates into the example's `docs/generate/` folder
// (they sit alongside the committed `index.mdx`, which must be kept).
function cleanGeneratedPages() {
  const dir = join(siteDir, "docs", "generate");
  for (const f of ["repo.mdx", ".gitlab-generated", ".gitignore"]) {
    rmSync(join(dir, f), { force: true });
  }
}

/**
 * Runs `npm run build` ASYNCHRONOUSLY and awaits it. We must NOT use
 * execFileSync here: the GitLab stub server runs in this same (vitest) process,
 * and a synchronous child process would block the event loop so the stub could
 * never answer the build's API requests (gitbeaker would retry until timeout).
 */
function runBuild(env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "build"], { cwd: siteDir, stdio: "inherit", env });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`docusaurus build exited with code ${code}`)),
    );
  });
}

describe("e2e: docusaurus build", () => {
  beforeAll(async () => {
    stub = await startGitlabStub();
    rmSync(join(siteDir, "build"), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    rmSync(join(siteDir, "node_modules", ".cache", "@ebuildy/docusaurus-plugin-gitlab"), {
      recursive: true,
      force: true,
    });
    cleanGeneratedPages();
    await runBuild({ ...process.env, GITLAB_HOST: stub.url, GITLAB_TOKEN: "" });
  }, 180_000);

  afterAll(async () => {
    await stub?.stop();
    rmSync(join(siteDir, "build"), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    cleanGeneratedPages();
  });

  it("bakes project info, releases, and issues into the static html", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    expect(html).toContain("Repo");
    expect(html).toContain("v1.0");
    expect(html).toContain("A bug");
    expect(html).toContain("Readme body");
  });

  it("downloads and localizes README images into the gitlab-assets dir", () => {
    const assetDir = join(siteDir, "static", "gitlab-assets");
    const files = readdirSync(assetDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  });

  it("references the localized asset path from the built html", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    expect(html).toContain("/gitlab-assets/");
  });

  it("merges sidebar README headings into the page's right-hand TOC", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    // README headings appear as Docusaurus TOC links, not as an inline gitlab nav.
    expect(html).toContain("table-of-contents");
    expect(html).toContain('href="#install"');
    expect(html).toContain('href="#usage"');
    expect(html).not.toContain("gitlab-md-toc");
    // README heading ids are present in the rendered body for the anchors to resolve.
    expect(html).toContain('id="install"');
  });

  it("interleaves sidebar README headings after the page's own heading in document order", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    // The page's own heading and the README headings all appear in the right-hand TOC...
    expect(html).toContain('href="#overview"');
    expect(html).toContain('href="#install"');
    // ...and the README headings come AFTER the page heading that precedes the component.
    expect(html.indexOf('href="#overview"')).toBeLessThan(html.indexOf('href="#install"'));
  });

  it("bakes topics and labels into the static html", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
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

  it("generates a child page nested under the declaring index page, with a card grid", () => {
    // The generator wrote the child page as a SIBLING of the declaring index page
    // (docs/generate/index.mdx), so Docusaurus nests it under that page.
    const childSource = join(siteDir, "docs", "generate", "repo.mdx");
    expect(readFileSync(childSource, "utf8")).toContain('<GitlabReadme project="group/repo" />');
    // No leftover subfolder from the old basePath model.
    expect(existsSync(join(siteDir, "docs", "generate", "projects"))).toBe(false);

    // The child page built at /generate/repo and baked in the README.
    const childHtml = readFileSync(join(siteDir, "build", "generate", "repo", "index.html"), "utf8");
    expect(childHtml).toContain("Readme body");

    // The declaring page (/generate/) rendered the card grid linking to the child
    // via a bare slug, which resolves against the page's trailing-slash URL
    // (`/generate/` + `repo` → `/generate/repo`).
    const indexHtml = readFileSync(join(siteDir, "build", "generate", "index.html"), "utf8");
    expect(indexHtml).toContain("gitlab-project-grid");
    expect(indexHtml).toContain('class="gitlab-project-card" href="repo"');
    expect(indexHtml).toContain("Repo");
  });
});
