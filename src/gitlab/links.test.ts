import { describe, it, expect } from "vitest";
import { resolveRepoLink, type RepoLinkContext } from "./links";

const gitlab: RepoLinkContext = {
  mode: "gitlab",
  publicUrl: "https://gitlab.com",
  project: "group/proj",
  ref: "main",
  basePath: "README.md",
};

describe("resolveRepoLink — pass-through", () => {
  it.each([
    ["", "empty"],
    ["   ", "whitespace only"],
    ["#usage", "in-page anchor"],
    ["?tab=readme", "query only"],
    ["https://example.com/x", "absolute https"],
    ["http://example.com/x", "absolute http"],
    ["mailto:a@b.com", "mailto"],
    ["tel:+33123", "tel"],
    ["data:text/plain,hi", "data URI"],
    ["//cdn.example.com/x.png", "protocol-relative"],
  ])("leaves %j untouched (%s)", (href) => {
    expect(resolveRepoLink(href, gitlab)).toBe(href);
  });
});

describe("resolveRepoLink — gitlab mode", () => {
  it.each([
    ["README.md", "CONTRIBUTING.md", "https://gitlab.com/group/proj/-/blob/main/CONTRIBUTING.md"],
    ["README.md", "./docs/x.md", "https://gitlab.com/group/proj/-/blob/main/docs/x.md"],
    ["README.md", "/docs/x.md", "https://gitlab.com/group/proj/-/blob/main/docs/x.md"],
    ["docs/a.md", "b.md", "https://gitlab.com/group/proj/-/blob/main/docs/b.md"],
    ["docs/a.md", "../b.md", "https://gitlab.com/group/proj/-/blob/main/b.md"],
    ["docs/deep/a.md", "../../top.md", "https://gitlab.com/group/proj/-/blob/main/top.md"],
    ["docs/a.md", "../../../etc", "https://gitlab.com/group/proj/-/blob/main/etc"],
  ])("resolves %j + %j", (basePath, href, expected) => {
    expect(resolveRepoLink(href, { ...gitlab, basePath })).toBe(expected);
  });

  it("preserves a hash", () => {
    expect(resolveRepoLink("./docs/x.md#install", gitlab)).toBe(
      "https://gitlab.com/group/proj/-/blob/main/docs/x.md#install",
    );
  });

  it("preserves a query and a hash together", () => {
    expect(resolveRepoLink("docs/x.md?plain=1#L4", gitlab)).toBe(
      "https://gitlab.com/group/proj/-/blob/main/docs/x.md?plain=1#L4",
    );
  });

  it("tolerates a trailing slash on publicUrl", () => {
    expect(resolveRepoLink("x.md", { ...gitlab, publicUrl: "https://gl.example.com/" })).toBe(
      "https://gl.example.com/group/proj/-/blob/main/x.md",
    );
  });

  it("treats an absent basePath as the repository root", () => {
    expect(resolveRepoLink("docs/x.md", { ...gitlab, basePath: undefined })).toBe(
      "https://gitlab.com/group/proj/-/blob/main/docs/x.md",
    );
  });

  it("uses the ref it is given, not a default branch", () => {
    expect(resolveRepoLink("CHANGELOG.md", { ...gitlab, ref: "v1.2.0" })).toBe(
      "https://gitlab.com/group/proj/-/blob/v1.2.0/CHANGELOG.md",
    );
  });

  it("supports a nested-namespace project", () => {
    expect(resolveRepoLink("x.md", { ...gitlab, project: "group/sub/proj" })).toBe(
      "https://gitlab.com/group/sub/proj/-/blob/main/x.md",
    );
  });

  it("supports a ref containing a slash", () => {
    expect(resolveRepoLink("x.md", { ...gitlab, ref: "feature/foo" })).toBe(
      "https://gitlab.com/group/proj/-/blob/feature/foo/x.md",
    );
  });

  it.each([
    ["..", "parent-directory reference"],
    [".", "current-directory reference"],
    ["/", "root reference"],
  ])("falls back to the repo tree URL when %j normalizes to an empty path (%s)", (href) => {
    expect(resolveRepoLink(href, gitlab)).toBe("https://gitlab.com/group/proj/-/tree/main");
  });
});

const site: RepoLinkContext = {
  mode: "site",
  publicUrl: "https://gitlab.com",
  project: "group/proj",
  ref: "main",
  basePath: "README.md",
  linkBase: "/repo",
};

describe("resolveRepoLink — site mode", () => {
  it.each([
    ["README.md", "CONTRIBUTING.md", "/repo/CONTRIBUTING"],
    ["README.md", "./docs/x.md", "/repo/docs/x"],
    ["README.md", "./docs/x.mdx", "/repo/docs/x"],
    ["README.md", "/docs/x.md", "/repo/docs/x"],
    ["docs/a.md", "../b.md", "/repo/b"],
    ["docs/a.md", "assets/logo.png", "/repo/docs/assets/logo.png"],
  ])("resolves %j + %j", (basePath, href, expected) => {
    expect(resolveRepoLink(href, { ...site, basePath })).toBe(expected);
  });

  it("preserves a hash after stripping the extension", () => {
    expect(resolveRepoLink("./docs/x.md#install", site)).toBe("/repo/docs/x#install");
  });

  it("emits a root-absolute path when linkBase is empty", () => {
    expect(resolveRepoLink("./docs/x.md", { ...site, linkBase: "" })).toBe("/docs/x");
  });

  it("emits a root-absolute path when linkBase is absent", () => {
    expect(resolveRepoLink("./docs/x.md", { ...site, linkBase: undefined })).toBe("/docs/x");
  });

  it("tolerates a trailing slash on linkBase", () => {
    expect(resolveRepoLink("x.md", { ...site, linkBase: "/repo/" })).toBe("/repo/x");
  });

  it("strips the extension case-insensitively", () => {
    expect(resolveRepoLink("READ.MD", site)).toBe("/repo/READ");
  });

  it("leaves anchors and absolute URLs untouched", () => {
    expect(resolveRepoLink("#usage", site)).toBe("#usage");
    expect(resolveRepoLink("https://example.com/x.md", site)).toBe("https://example.com/x.md");
  });
});

describe("resolveRepoLink — keep mode", () => {
  it.each(["./docs/x.md", "/docs/x.md", "../b.md", "#usage", "https://example.com"])(
    "returns %j unchanged",
    (href) => {
      expect(resolveRepoLink(href, { ...gitlab, mode: "keep" })).toBe(href);
    },
  );
});

describe("resolveRepoLink — site mode, empty path", () => {
  it.each([[".."], ["."], ["/"]])("resolves %j to the linkBase root", (href) => {
    expect(resolveRepoLink(href, site)).toBe("/repo");
  });

  it("resolves an empty path to \"/\" when linkBase is empty", () => {
    expect(resolveRepoLink("..", { ...site, linkBase: "" })).toBe("/");
  });
});
