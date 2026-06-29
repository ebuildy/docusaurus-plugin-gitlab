import { describe, it, expect } from "vitest";
import { buildTocItems, insertReadmeToc, type TocItem } from "./toc-merge";

describe("buildTocItems", () => {
  it("returns [] for no entries", () => {
    expect(buildTocItems([])).toEqual([]);
  });

  it("nests deeper headings under the preceding shallower one", () => {
    const items = buildTocItems([
      { level: 2, id: "a", text: "A" },
      { level: 3, id: "b", text: "B" },
      { level: 2, id: "c", text: "C" },
    ]);
    expect(items).toEqual([
      { value: "A", id: "a", level: 2, children: [{ value: "B", id: "b", level: 3, children: [] }] },
      { value: "C", id: "c", level: 2, children: [] },
    ]);
  });
});

describe("insertReadmeToc", () => {
  const page: TocItem[] = [
    { value: "Intro", id: "intro", level: 2, children: [] },
    { value: "Outro", id: "outro", level: 2, children: [] },
  ];
  const readme: TocItem[] = [{ value: "Install", id: "install", level: 2, children: [] }];

  it("prepends README items when there is no preceding heading", () => {
    const out = insertReadmeToc(page, null, readme);
    expect(out.map((i) => i.id)).toEqual(["install", "intro", "outro"]);
  });

  it("inserts README items right after the preceding sibling heading", () => {
    const out = insertReadmeToc(page, "intro", readme);
    expect(out.map((i) => i.id)).toEqual(["intro", "install", "outro"]);
  });

  it("nests README items under the preceding heading when README is deeper", () => {
    const out = insertReadmeToc(page, "intro", [
      { value: "Deep", id: "deep", level: 3, children: [] },
    ]);
    expect(out[0].children.map((c) => c.id)).toEqual(["deep"]);
  });

  it("appends at root when the preceding id is not found", () => {
    const out = insertReadmeToc(page, "missing", readme);
    expect(out.map((i) => i.id)).toEqual(["intro", "outro", "install"]);
  });

  it("does not mutate the input array", () => {
    insertReadmeToc(page, "intro", readme);
    expect(page.map((i) => i.id)).toEqual(["intro", "outro"]);
  });
});
