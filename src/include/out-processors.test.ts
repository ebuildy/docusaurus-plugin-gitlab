import { describe, it, expect } from "vitest";
import {
  applyOutProcessors,
  fixAutolinks,
  fixVoidTags,
  getOutProcessors,
  registerOutProcessors,
  type OutProcessor,
} from "./out-processors.js";

describe("fixAutolinks", () => {
  it("rewrites a bare email autolink to a mailto link", async () => {
    expect(await fixAutolinks("Email: <contact@example.com>")).toBe(
      "Email: [contact@example.com](mailto:contact@example.com)",
    );
  });

  it("rewrites a URL autolink to a markdown link", async () => {
    expect(await fixAutolinks("See <https://example.com> now")).toBe(
      "See [https://example.com](https://example.com) now",
    );
  });

  it("strips the scheme from a mailto autolink label", async () => {
    expect(await fixAutolinks("<mailto:a@b.com>")).toBe("[a@b.com](mailto:a@b.com)");
  });

  it("leaves real HTML tags untouched", async () => {
    expect(await fixAutolinks("<div>hi</div>")).toBe("<div>hi</div>");
  });

  it("leaves autolinks inside fenced code verbatim", async () => {
    const md = "before <a@b.com>\n\n```\n<a@b.com>\n```\n";
    const out = await fixAutolinks(md);
    expect(out).toContain("before [a@b.com](mailto:a@b.com)");
    expect(out).toContain("```\n<a@b.com>\n```"); // untouched inside the fence
  });

  it("leaves an autolink inside inline code verbatim", async () => {
    expect(await fixAutolinks("use `<a@b.com>` here")).toBe("use `<a@b.com>` here");
  });
});

describe("fixVoidTags", () => {
  it("self-closes a bare <br>", async () => {
    expect(await fixVoidTags("a<br>b")).toBe("a<br />b");
  });

  it("self-closes a void element with attributes", async () => {
    expect(await fixVoidTags('<img src="x.png">')).toBe('<img src="x.png" />');
  });

  it("leaves an already self-closed tag effectively unchanged", async () => {
    expect(await fixVoidTags("a<br/>b")).toBe("a<br />b");
    expect(await fixVoidTags("a<br />b")).toBe("a<br />b");
  });

  it("does not touch non-void tags", async () => {
    expect(await fixVoidTags("<div>x</div>")).toBe("<div>x</div>");
  });

  it("leaves void tags inside code verbatim", async () => {
    expect(await fixVoidTags("use `<br>` and\n\n```\n<br>\n```\n")).toContain("`<br>`");
    expect(await fixVoidTags("```\n<br>\n```\n")).toContain("```\n<br>\n```");
  });
});

describe("applyOutProcessors", () => {
  it("runs processors in order", async () => {
    const a: OutProcessor = (md) => md + "-a";
    const b: OutProcessor = async (md) => md + "-b";
    expect(await applyOutProcessors("x", [a, b])).toBe("x-a-b");
  });

  it("returns the input unchanged for an empty list", async () => {
    expect(await applyOutProcessors("x", [])).toBe("x");
  });
});

describe("processor registry", () => {
  it("stores and retrieves processors by key", () => {
    const procs = [fixAutolinks];
    registerOutProcessors("k1", procs);
    expect(getOutProcessors("k1")).toBe(procs);
  });

  it("returns an empty list for an unknown key", () => {
    expect(getOutProcessors("missing-key")).toEqual([]);
  });
});
