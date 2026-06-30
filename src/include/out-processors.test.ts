import { describe, it, expect } from "vitest";
import {
  applyOutProcessors,
  convertAlerts,
  fixAutolinks,
  fixInlineStyles,
  fixVoidTags,
  getOutProcessors,
  registerOutProcessors,
  stripTableOfContents,
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

describe("fixInlineStyles", () => {
  it("converts a string style attribute to a JSX style object", async () => {
    expect(await fixInlineStyles('<p style="color: red;">x</p>')).toBe(
      '<p style={{ color: "red" }}>x</p>',
    );
  });

  it("camelCases multiple declarations", async () => {
    expect(await fixInlineStyles('<div style="margin-right: 1em; text-align: center">x</div>')).toBe(
      '<div style={{ marginRight: "1em", textAlign: "center" }}>x</div>',
    );
  });

  it("handles single-quoted attributes", async () => {
    expect(await fixInlineStyles("<p style='color: blue'>x</p>")).toBe(
      '<p style={{ color: "blue" }}>x</p>',
    );
  });

  it("keeps a CSS custom property as a quoted key", async () => {
    expect(await fixInlineStyles('<p style="--accent: #f00">x</p>')).toBe(
      '<p style={{ "--accent": "#f00" }}>x</p>',
    );
  });

  it("leaves tags without a style attribute untouched", async () => {
    expect(await fixInlineStyles("<p>plain</p>")).toBe("<p>plain</p>");
  });

  it("leaves style attributes inside code verbatim", async () => {
    expect(await fixInlineStyles('use `<p style="x">`')).toBe('use `<p style="x">`');
  });
});

describe("convertAlerts", () => {
  it("converts a note alert to a Docusaurus admonition", async () => {
    const out = await convertAlerts("> [!note]\n> This is a note.");
    expect(out).toBe(":::note\n\nThis is a note.\n\n:::");
  });

  it("maps important to info and caution to danger", async () => {
    expect(await convertAlerts("> [!important]\n> x")).toContain(":::info");
    expect(await convertAlerts("> [!caution]\n> x")).toContain(":::danger");
  });

  it("preserves multi-line content and blank quote lines", async () => {
    const out = await convertAlerts("> [!tip]\n> Para 1\n>\n> Para 2");
    expect(out).toBe(":::tip\n\nPara 1\n\nPara 2\n\n:::");
  });

  it("uses a bracketed title when text follows the marker", async () => {
    const out = await convertAlerts("> [!warning] Heads up\n> body");
    expect(out).toBe(":::warning[Heads up]\n\nbody\n\n:::");
  });

  it("leaves a regular blockquote untouched", async () => {
    expect(await convertAlerts("> just a quote")).toBe("> just a quote");
  });

  it("ignores alert syntax inside a fenced code block", async () => {
    const md = "```\n> [!note]\n> x\n```";
    expect(await convertAlerts(md)).toBe(md);
  });
});

describe("stripTableOfContents", () => {
  it("removes a TOC section up to the next same-level heading", async () => {
    const md = [
      "# Title",
      "",
      "## Table of Contents",
      "",
      "- [One](#one)",
      "- [Two](#two)",
      "",
      "## One",
      "",
      "body",
    ].join("\n");
    const out = await stripTableOfContents(md);
    expect(out).not.toContain("Table of Contents");
    expect(out).not.toContain("[One](#one)");
    expect(out).toContain("## One");
    expect(out).toContain("body");
  });

  it("matches Contents and TOC headings case-insensitively", async () => {
    expect(await stripTableOfContents("## Contents\n\n- x\n\n## Real\n\nhi")).not.toContain("- x");
    expect(await stripTableOfContents("### toc\n\n- x\n\n### Real\n\nhi")).not.toContain("- x");
  });

  it("removes a bare [[_TOC_]] marker", async () => {
    expect(await stripTableOfContents("intro\n\n[[_TOC_]]\n\nbody")).not.toContain("[[_TOC_]]");
  });

  it("leaves content without a TOC untouched", async () => {
    const md = "# Title\n\n## Install\n\nsetup";
    expect(await stripTableOfContents(md)).toBe(md);
  });

  it("ignores a TOC-looking heading inside a code block", async () => {
    const md = "# Title\n\n```\n## Table of Contents\n```\n\nbody";
    expect(await stripTableOfContents(md)).toBe(md);
  });

  it("strips a final TOC section to end of document", async () => {
    const out = await stripTableOfContents("## Intro\n\nhi\n\n## Table of Contents\n\n- [a](#a)\n");
    expect(out).toContain("## Intro");
    expect(out).not.toContain("Table of Contents");
    expect(out).not.toContain("[a](#a)");
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
