import { describe, expect, it } from "vitest";
import { createHostMask } from "../gitlab/mask-host.js";
import { applyOutProcessors, fixAutolinks, fixInlineStyles, fixVoidTags } from "./out-processors.js";

// Every regex in the include/render path runs over README text fetched from
// GitLab, i.e. content this package does not control. Catastrophic backtracking
// there is a build-time denial of service. These inputs are the classic
// "unterminated construct + long run" shapes that trigger it; linear matching
// finishes in milliseconds, so the budget is deliberately generous — it only
// fires on an exponential blowup, never on a slow machine.
const N = 50_000;
const BUDGET_MS = 2_000;

const PATHOLOGICAL: Array<[name: string, input: string]> = [
  ["unterminated URI autolink", "<" + "a".repeat(N)],
  ["unterminated scheme-ish autolink", "<" + "a:".repeat(N / 2)],
  ["unterminated email autolink", "<" + "a@".repeat(N / 2)],
  ["email autolink with dot run", "<a@" + "a.".repeat(N / 2)],
  ["unterminated void tag", "<img " + "a".repeat(N)],
  ["void tag attribute run", "<br " + "a=b ".repeat(N / 4)],
  ["unterminated style attribute", 'style="' + "a".repeat(N)],
  ["style attribute semicolon run", 'style="' + "a:b;".repeat(N / 4) + '"'],
  ["angle bracket run", "<".repeat(N)],
  ["newline run", "\n".repeat(N)],
];

describe("regex passes over untrusted markdown are not ReDoS-prone", () => {
  it.each(PATHOLOGICAL)("%s", async (_name, input) => {
    const started = performance.now();
    await applyOutProcessors(input, [fixAutolinks, fixVoidTags, fixInlineStyles]);
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });

  it("host masking stays linear even when the host is regex metacharacters", () => {
    const mask = createHostMask("https://a.b-c.test/x+y(z)*", "https://public.test");
    const started = performance.now();
    mask("https://a.b-c.test/x+y(z)*".repeat(1000) + "a".repeat(N));
    expect(performance.now() - started).toBeLessThan(BUDGET_MS);
  });
});
