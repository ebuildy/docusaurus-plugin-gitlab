import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { parseInclude, type IncludeSpec } from "./grammar.js";

// Realistic GitLab shapes. Project/group slugs are restricted by GitLab to
// alphanumerics plus `.-_`; refs are branch/tag names; file paths are far more
// permissive and routinely contain `@` (e.g. `packages/@scope/README.md`).
const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const segment = fc
  .tuple(
    fc.constantFrom(...ALNUM),
    fc.string({ unit: fc.constantFrom(...ALNUM, ".", "_", "-"), maxLength: 15 }),
  )
  .map(([head, tail]) => head + tail);
const project = fc.array(segment, { minLength: 2, maxLength: 4 }).map((s) => s.join("/"));
const ref = fc.oneof(
  segment,
  fc.tuple(fc.constantFrom("feat", "fix", "release"), segment).map(([a, b]) => `${a}/${b}`),
);
const pathSegment = fc.oneof(segment, segment.map((s) => `@${s}`));
const filePath = fc
  .tuple(fc.array(pathSegment, { maxLength: 3 }), segment, fc.constantFrom("md", "ts", "yml"))
  .map(([dirs, base, ext]) => [...dirs, `${base}.${ext}`].join("/"));

describe("parseInclude properties", () => {
  test.prop([fc.constantFrom<"readme" | "file">("readme", "file"), fc.string()])(
    "never throws anything but a descriptive Error",
    (kind, raw) => {
      try {
        parseInclude(kind, raw);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).constructor).toBe(Error);
        expect((err as Error).message).not.toBe("");
      }
    },
  );

  test.prop([fc.constantFrom<"readme" | "file">("readme", "file"), fc.string()])(
    "a returned spec always carries a non-empty project",
    (kind, raw) => {
      let spec: IncludeSpec;
      try {
        spec = parseInclude(kind, raw);
      } catch {
        return; // rejecting malformed input is the contract
      }
      expect(spec.project).not.toBe("");
      if (kind === "file") expect(spec.path).toBeTruthy();
    },
  );

  test.prop([project, fc.option(ref, { nil: undefined })])(
    "readme specs round-trip",
    (proj, r) => {
      const raw = r ? `${r}@${proj}` : proj;
      expect(parseInclude("readme", raw)).toEqual({
        kind: "readme",
        project: proj,
        ...(r ? { ref: r } : {}),
      });
    },
  );

  test.prop([
    project,
    fc.option(ref, { nil: undefined }),
    filePath,
    fc.option(
      fc.oneof(
        fc.integer({ min: 1, max: 999 }).map(String),
        fc
          .tuple(fc.integer({ min: 1, max: 500 }), fc.integer({ min: 1, max: 500 }))
          .map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`),
      ),
      { nil: undefined },
    ),
  ])("file specs round-trip", (proj, r, path, lineRange) => {
    const raw =
      (r ? `${r}@` : "") + `${proj}/-/${path}` + (lineRange ? `#L${lineRange}` : "");
    expect(parseInclude("file", raw)).toEqual({
      kind: "file",
      project: proj,
      path,
      ...(r ? { ref: r } : {}),
      ...(lineRange ? { lineRange } : {}),
    });
  });
});
