import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { createHostMask, maskHostDeep } from "./mask-host.js";

const hostname = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}(\.[a-z][a-z0-9-]{0,10}){1,3}$/);
const internal = fc
  .tuple(fc.constantFrom("https://", "http://"), hostname, fc.constantFrom("", "/gitlab", "/x/y"))
  .map(([s, h, p]) => s + h + p);
// `$` is a legal URI sub-delim, and `$&` / `$1` are special in String#replace.
const publicUrl = fc
  .tuple(fc.constantFrom("https://", "http://"), hostname, fc.constantFrom("", "/g", "/$&", "/a$1b", "/$$"))
  .map(([s, h, p]) => s + h + p);

describe("createHostMask properties", () => {
  test.prop([fc.string(), fc.string()])("never throws, whatever the configured strings", (from, to) => {
    const mask = createHostMask(from, to);
    expect(typeof mask("anything")).toBe("string");
  });

  test.prop([internal, publicUrl, fc.string()])(
    "the internal host never survives in the output",
    (from, to, noise) => {
      fc.pre(from !== to && !to.includes(from));
      const mask = createHostMask(from, to);
      // Boundary-terminated occurrences — the ones the mask promises to catch.
      for (const text of [from, `${from}/a`, `see ${from}/a?b=1 ok`, `${noise}${from}/a${noise}`]) {
        expect(mask(text)).not.toContain(`${from}/`);
      }
    },
  );

  test.prop([internal, publicUrl])("substitutes the public URL literally, not as a $-pattern", (from, to) => {
    fc.pre(from !== to && !to.includes(from));
    expect(createHostMask(from, to)(`${from}/x`)).toBe(`${to}/x`);
  });

  test.prop([internal, publicUrl])("masks the percent-encoded form too (badge/shield URLs)", (from, to) => {
    fc.pre(from !== to && !to.includes(from));
    const mask = createHostMask(from, to);
    const encoded = encodeURIComponent(from);
    expect(mask(`https://img.shields.io/badge?url=${encoded}%2Fx`)).toBe(
      `https://img.shields.io/badge?url=${encodeURIComponent(to)}%2Fx`,
    );
  });

  test.prop([internal, publicUrl, fc.string()])("is idempotent", (from, to, noise) => {
    fc.pre(from !== to && !to.includes(from));
    const mask = createHostMask(from, to);
    const once = mask(`${noise} ${from}/a ${encodeURIComponent(from)} ${noise}`);
    expect(mask(once)).toBe(once);
  });

  test.prop([internal, publicUrl])("matches the host case-insensitively but not the path", (from, to) => {
    fc.pre(from !== to && !to.includes(from));
    const mask = createHostMask(from, to);
    const { origin } = new URL(from);
    const rest = from.slice(origin.length);
    expect(mask(origin.toUpperCase() + rest + "/x")).toBe(`${to}/x`);
  });

  test.prop([internal, publicUrl])("leaves a longer, unrelated host alone", (from, to) => {
    fc.pre(from !== to && !to.includes(from));
    const mask = createHostMask(from, to);
    const decoy = `${from}extra.example.com/x`;
    expect(mask(decoy)).toBe(decoy);
  });

  test.prop([internal, publicUrl])("walks nested structures without mutating the input", (from, to) => {
    fc.pre(from !== to && !to.includes(from));
    const mask = createHostMask(from, to);
    const input = { a: [`${from}/x`, { b: `${from}/y` }], c: 1, d: null };
    const out = maskHostDeep(structuredClone(input), mask);
    expect(out).toEqual({ a: [`${to}/x`, { b: `${to}/y` }], c: 1, d: null });
  });

  test.prop([fc.string()])("a disabled mask returns the very same reference", (noise) => {
    const value = { deep: [noise] };
    expect(maskHostDeep(value, createHostMask(undefined, undefined))).toBe(value);
    expect(maskHostDeep(value, createHostMask("https://a.test", "https://a.test"))).toBe(value);
  });
});
