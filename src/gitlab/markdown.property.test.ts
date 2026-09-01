import { fc, test } from "@fast-check/vitest";
import type { Root, Element } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { visit } from "unist-util-visit";
import { describe, expect } from "vitest";
import { renderMarkdown } from "./markdown.js";

// Tags that must never survive sanitization, whatever the input.
const FORBIDDEN_TAGS = new Set([
  "script", "iframe", "object", "embed", "base", "form", "input",
  "button", "textarea", "style", "meta", "link", "frame", "frameset",
]);
// URL attributes and the only schemes allowed to appear in them. Anything else
// (javascript:, vbscript:, data:, file:, …) must have been stripped; a URL with
// no scheme at all is relative, and therefore safe.
const URL_ATTRS = ["href", "src", "action", "formAction", "xlinkHref", "poster"] as const;
const SCHEME_RE = /^\s*([a-z][\w+.-]*):/i;
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel", "xmpp", "irc", "ftp"]);

// A soup of real XSS payloads (including mXSS shapes that abuse the raw-HTML
// reparse) interleaved with arbitrary text, so the fuzzer explores how markdown
// constructs and raw HTML nest into each other.
const PAYLOADS = [
  "<script>alert(1)</script>",
  "<ScRiPt>alert(1)</ScRiPt>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "<svg><animate onbegin=alert(1) attributeName=x dur=1s>",
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  "[x](javascript:alert(1))",
  "[x](vbscript:alert(1))",
  '![x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  "<iframe src=javascript:alert(1)></iframe>",
  "<object data=javascript:alert(1)></object>",
  "<embed src=javascript:alert(1)>",
  "<base href=//evil.example/>",
  "<details open ontoggle=alert(1)>",
  "<body onload=alert(1)>",
  "<form action=//evil.example><button formaction=javascript:alert(1)>x",
  "<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>",
  "<noscript><p title='</noscript><img src=x onerror=alert(1)>'>",
  "<style>@import 'javascript:alert(1)'</style>",
  "<!--<img src=x onerror=alert(1)>-->",
  "<template><script>alert(1)</script></template>",
  "<xmp><img src=x onerror=alert(1)></xmp>",
  "<![CDATA[<script>alert(1)</script>]]>",
  "```\n<script>alert(1)</script>\n```",
  "> <script>alert(1)</script>",
  "| <img src=x onerror=alert(1)> |\n| --- |",
  "[[_TOC_]]",
];

const nastyMarkdown = fc
  .array(
    fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...PAYLOADS) },
      { weight: 1, arbitrary: fc.string() },
      { weight: 1, arbitrary: fc.constantFrom("#", "##", "-", ">", "`", "```", "*", "<", ">", "\"", "'", "&") },
    ),
    { minLength: 1, maxLength: 8 },
  )
  .map((parts) => parts.join("\n"));

function inspect(html: string): { tags: string[]; onAttrs: string[]; urls: string[] } {
  const tree = fromHtml(html, { fragment: true }) as Root;
  const tags: string[] = [];
  const onAttrs: string[] = [];
  const urls: string[] = [];
  visit(tree, "element", (el: Element) => {
    tags.push(el.tagName.toLowerCase());
    for (const [key, value] of Object.entries(el.properties ?? {})) {
      if (/^on/i.test(key)) onAttrs.push(key);
      if ((URL_ATTRS as readonly string[]).includes(key) && typeof value === "string") urls.push(value);
    }
  });
  return { tags, onAttrs, urls };
}

describe("renderMarkdown sanitization properties", () => {
  test.prop([nastyMarkdown], { numRuns: 200 })(
    "never emits an executable tag, an event handler, or an unsafe URL scheme",
    async (md) => {
      const html = await renderMarkdown(md, {});
      const { tags, onAttrs, urls } = inspect(html);

      expect(tags.filter((t) => FORBIDDEN_TAGS.has(t))).toEqual([]);
      expect(onAttrs).toEqual([]);
      for (const url of urls) {
        const scheme = SCHEME_RE.exec(url)?.[1];
        if (scheme) expect(SAFE_SCHEMES).toContain(scheme.toLowerCase());
      }
    },
  );

  test.prop([nastyMarkdown], { numRuns: 200 })(
    "survives a parse/serialize round-trip unchanged (no mutation XSS)",
    async (md) => {
      const html = await renderMarkdown(md, {});
      // The sanitizer inspected a tree; the browser re-parses the serialized
      // string. If a second round-trip grows elements or resurrects handlers,
      // the two disagree — the classic mutation-XSS shape.
      const once = inspect(html);
      const twice = inspect(toHtml(fromHtml(html, { fragment: true })));
      expect(twice.tags).toEqual(once.tags);
      expect(twice.onAttrs).toEqual([]);
      expect(twice.tags.filter((t) => FORBIDDEN_TAGS.has(t))).toEqual([]);
    },
  );

  test.prop([nastyMarkdown], { numRuns: 100 })("always returns a string and never throws", async (md) => {
    expect(typeof (await renderMarkdown(md, {}))).toBe("string");
  });
});
