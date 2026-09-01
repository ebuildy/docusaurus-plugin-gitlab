import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  applyOutProcessors,
  convertAlerts,
  fixAutolinks,
  fixInlineStyles,
  fixVoidTags,
  stripTableOfContents,
} from "./out-processors.js";

// Markdown built from the constructs each processor rewrites, so the fuzzer
// explores how they nest (autolinks inside fences, alerts inside tables, …).
const FRAGMENTS = [
  "<https://example.com/a?b=1&c=2>",
  "<mailto:me@example.com>",
  "<user@example.com>",
  "<br>",
  "<br/>",
  "<br />",
  '<img src="x.png" alt="a">',
  "<hr>",
  '<div style="color: red; background-color: blue">x</div>',
  "<div style='--custom: 1; -webkit-box-shadow: none; -ms-flex: 1'>x</div>",
  '<div style="">x</div>',
  "> [!note]\n> body",
  "> [!warning] Titled\n> body\n> more",
  "> [!caution]",
  "```\n<br> <https://x.test> style=\"color: red\"\n```",
  "~~~\n> [!note]\n~~~",
  "`<br>`",
  "## Table of Contents\n\n- [a](#a)\n\n## Next",
  "[[_TOC_]]",
  "# Heading",
  "| a | b |\n| --- | --- |\n| <br> | x |",
  "text",
  "",
];

const markdown = fc
  .array(fc.constantFrom(...FRAGMENTS), { minLength: 1, maxLength: 6 })
  .map((parts) => parts.join("\n\n"));

const PROCESSORS = [
  ["fixAutolinks", fixAutolinks],
  ["fixVoidTags", fixVoidTags],
  ["fixInlineStyles", fixInlineStyles],
  ["convertAlerts", convertAlerts],
  ["stripTableOfContents", stripTableOfContents],
] as const;

describe("out-processor properties", () => {
  for (const [name, proc] of PROCESSORS) {
    test.prop([markdown], { numRuns: 100 })(`${name} is idempotent`, async (md) => {
      const once = await proc(md);
      expect(await proc(once)).toBe(once);
    });
  }

  test.prop([markdown], { numRuns: 100 })(
    "the MDX-safety processors leave fenced code untouched",
    async (md) => {
      const fenced = "```\n" + "<br> <https://x.test> <div style=\"color: red\">\n" + "```";
      const src = `${md}\n\n${fenced}\n`;
      const out = await applyOutProcessors(src, [fixAutolinks, fixVoidTags, fixInlineStyles]);
      expect(out).toContain(fenced);
    },
  );

  test.prop([markdown], { numRuns: 100 })(
    "the full chain never throws and always yields a string",
    async (md) => {
      const out = await applyOutProcessors(md, [
        fixAutolinks,
        fixVoidTags,
        fixInlineStyles,
        convertAlerts,
        stripTableOfContents,
      ]);
      expect(typeof out).toBe("string");
    },
  );

  test.prop([markdown], { numRuns: 100 })(
    "fixVoidTags leaves no unclosed void tag behind",
    async (md) => {
      const out = await fixVoidTags(md);
      // Every `<br…>` / `<img…>` outside code must now be self-closing.
      expect(out).not.toMatch(/<(?:br|hr|img|input|meta|link)\b[^>]*[^/\s]>/i);
    },
  );

  test.prop([markdown], { numRuns: 100 })(
    "stripTableOfContents only ever removes content",
    async (md) => {
      expect((await stripTableOfContents(md)).length).toBeLessThanOrEqual(md.length);
    },
  );
});
