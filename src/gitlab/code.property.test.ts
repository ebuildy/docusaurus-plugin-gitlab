import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { applyLineRange, languageFromPath } from "./code.js";

const text = fc
  .array(fc.string({ unit: fc.constantFrom("a", "b", " ", "\t", "{", "}") }), {
    minLength: 1,
    maxLength: 30,
  })
  .map((lines) => lines.join("\n"));

describe("applyLineRange properties", () => {
  test.prop([text])("is the identity when no range is given", (src) => {
    expect(applyLineRange(src)).toBe(src);
    expect(applyLineRange(src, "")).toBe(src);
  });

  test.prop([text, fc.string()])("is the identity for a malformed range", (src, lines) => {
    fc.pre(!/^\s*\d+(?:-\d+)?\s*$/.test(lines) && lines !== "");
    expect(applyLineRange(src, lines)).toBe(src);
  });

  test.prop([text, fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 40 })])(
    "never yields more lines than the range spans",
    (src, a, b) => {
      const [start, end] = [Math.min(a, b), Math.max(a, b)];
      const out = applyLineRange(src, `${start}-${end}`);
      if (out === "") return;
      expect(out.split("\n").length).toBeLessThanOrEqual(end - start + 1);
    },
  );

  test.prop([text, fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 40 })])(
    "selects exactly the lines whose 1-based number falls inside the range",
    (src, a, b) => {
      const [start, end] = [Math.min(a, b), Math.max(a, b)];
      const srcLines = src.split("\n");
      const expected = srcLines.filter((_l, i) => i + 1 >= Math.max(start, 1) && i + 1 <= end);
      expect(applyLineRange(src, `${start}-${end}`)).toBe(expected.join("\n"));
    },
  );
});

describe("languageFromPath properties", () => {
  test.prop([fc.string()])("always returns a string and never throws", (path) => {
    expect(typeof languageFromPath(path)).toBe("string");
  });

  test.prop([fc.string(), fc.constantFrom("ts", "TS", "Py", "go")])(
    "is case-insensitive in the extension",
    (base, ext) => {
      fc.pre(!base.includes("/") && !base.includes("."));
      expect(languageFromPath(`${base}.${ext}`)).toBe(languageFromPath(`${base}.${ext.toLowerCase()}`));
    },
  );
});
