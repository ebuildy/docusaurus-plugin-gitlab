import { valueToEstree } from "estree-util-value-to-estree";
import { describe, it, expect } from "vitest";
import {
  findTocExport,
  makeTocExportNode,
  precedingHeadingId,
  readTocItems,
  writeTocItems,
  TocSliceError,
  mergeReadmeTocs,
} from "./toc-export";
import type { TocItem } from "./toc-merge";

const items: TocItem[] = [
  { value: "Intro", id: "intro", level: 2, children: [{ value: "Sub", id: "sub", level: 3, children: [] }] },
];

describe("readTocItems / writeTocItems", () => {
  it("round-trips toc items through estree", () => {
    expect(readTocItems(writeTocItems(items))).toEqual(items);
  });

  it("throws TocSliceError on a spread element (TOC slice)", () => {
    const arr = { type: "ArrayExpression", elements: [{ type: "SpreadElement" }] };
    expect(() => readTocItems(arr)).toThrow(TocSliceError);
  });

  it("throws TocSliceError when a property value is not a literal", () => {
    const arr = {
      type: "ArrayExpression",
      elements: [
        {
          type: "ObjectExpression",
          properties: [
            { type: "Property", key: { type: "Literal", value: "id" }, value: { type: "Identifier", name: "x" } },
          ],
        },
      ],
    };
    expect(() => readTocItems(arr)).toThrow(TocSliceError);
  });
});

describe("findTocExport / makeTocExportNode", () => {
  it("creates and then finds a toc export node", () => {
    const node = makeTocExportNode(items);
    const tree = { type: "root", children: [node] };
    const found = findTocExport(tree);
    expect(found).not.toBeNull();
    expect(readTocItems(found!.declarator.init)).toEqual(items);
  });

  it("returns null when there is no toc export", () => {
    expect(findTocExport({ type: "root", children: [] })).toBeNull();
  });
});

describe("precedingHeadingId", () => {
  it("returns the id of the heading immediately before the target node", () => {
    const target = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tree = {
      type: "root",
      children: [
        { type: "heading", data: { id: "first", hProperties: { id: "first" } } },
        { type: "paragraph" },
        target,
        { type: "heading", data: { id: "later", hProperties: { id: "later" } } },
      ],
    };
    expect(precedingHeadingId(tree, target)).toBe("first");
  });

  it("returns null when no heading precedes the target", () => {
    const target = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tree = { type: "root", children: [target] };
    expect(precedingHeadingId(tree, target)).toBeNull();
  });
});

describe("mergeReadmeTocs", () => {
  it("merges README entries into the existing toc export at the component position", () => {
    const readmeNode = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tocNode = makeTocExportNode([{ value: "Intro", id: "intro", level: 2, children: [] }]);
    const tree = {
      type: "root",
      children: [
        tocNode,
        { type: "heading", data: { id: "intro", hProperties: { id: "intro" } } },
        readmeNode,
      ],
    };
    mergeReadmeTocs(tree, [{ node: readmeNode, entries: [{ level: 2, id: "install", text: "Install" }] }]);
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i) => i.id)).toEqual(["intro", "install"]);
  });

  it("creates a toc export when none exists", () => {
    const readmeNode = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tree = { type: "root", children: [readmeNode] };
    mergeReadmeTocs(tree, [{ node: readmeNode, entries: [{ level: 2, id: "install", text: "Install" }] }]);
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i) => i.id)).toEqual(["install"]);
  });

  it("leaves the export untouched when it contains a TOC slice", () => {
    const readmeNode = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tocNode = makeTocExportNode([]);
    tocNode.data.estree.body[0].declaration.declarations[0].init = valueToEstree([]);
    tocNode.data.estree.body[0].declaration.declarations[0].init.elements = [{ type: "SpreadElement" }];
    const tree = { type: "root", children: [tocNode, readmeNode] };
    mergeReadmeTocs(tree, [{ node: readmeNode, entries: [{ level: 2, id: "install", text: "Install" }] }]);
    const found = findTocExport(tree)!;
    expect(found.declarator.init.elements).toEqual([{ type: "SpreadElement" }]);
  });
});
