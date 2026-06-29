import { valueToEstree } from "estree-util-value-to-estree";
import { visit, EXIT } from "unist-util-visit";
import type { TocEntry } from "../gitlab/toc.js";
import { buildTocItems, insertReadmeToc, type TocItem } from "./toc-merge.js";

/** Thrown when the page `toc` export contains a TOC slice (spread) we can't round-trip. */
export class TocSliceError extends Error {}

/** Find the `export const toc = [...]` mdxjsEsm node Docusaurus generated. */
export function findTocExport(tree: any): { node: any; declarator: any } | null {
  for (const child of tree.children ?? []) {
    if (child.type !== "mdxjsEsm") continue;
    const body = child.data?.estree?.body ?? [];
    for (const stmt of body) {
      if (stmt.type === "ExportNamedDeclaration" && stmt.declaration?.type === "VariableDeclaration") {
        for (const d of stmt.declaration.declarations) {
          if (d.id?.type === "Identifier" && d.id.name === "toc" && d.init?.type === "ArrayExpression") {
            return { node: child, declarator: d };
          }
        }
      }
    }
  }
  return null;
}

/** Read an estree ArrayExpression of toc items back into plain TocItem objects. */
export function readTocItems(arrayExpr: any): TocItem[] {
  return (arrayExpr.elements ?? []).map(readItem);
}

function readItem(el: any): TocItem {
  if (!el || el.type !== "ObjectExpression") throw new TocSliceError();
  const item: TocItem = { value: "", id: "", level: 0, children: [] };
  for (const prop of el.properties) {
    if (prop.type !== "Property") throw new TocSliceError();
    const key = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
    if (key === "children") {
      item.children = (prop.value.elements ?? []).map(readItem);
    } else if (key === "value" || key === "id" || key === "level") {
      if (prop.value.type !== "Literal") throw new TocSliceError();
      if (key === "value") item.value = String(prop.value.value);
      else if (key === "id") item.id = String(prop.value.value);
      else item.level = Number(prop.value.value);
    }
  }
  return item;
}

/** Serialize TocItem objects to an estree ArrayExpression. */
export function writeTocItems(items: TocItem[]): any {
  return valueToEstree(items, { preserveReferences: false });
}

/** Build a fresh `export const toc = [...]` mdxjsEsm node. */
export function makeTocExportNode(items: TocItem[]): any {
  const estree = {
    type: "Program",
    sourceType: "module",
    body: [
      {
        type: "ExportNamedDeclaration",
        specifiers: [],
        source: null,
        declaration: {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: { type: "Identifier", name: "toc" },
              init: writeTocItems(items),
            },
          ],
        },
      },
    ],
  };
  return { type: "mdxjsEsm", value: "", data: { estree } };
}

/** Id of the page heading immediately preceding `target` in document order, or null. */
export function precedingHeadingId(tree: any, target: any): string | null {
  let last: string | null = null;
  visit(tree, (node: any) => {
    if (node === target) return EXIT;
    if (node.type === "heading") {
      const id = node.data?.id ?? node.data?.hProperties?.id;
      if (typeof id === "string") last = id;
    }
    return undefined;
  });
  return last;
}

/**
 * Merge each sidebar README's headings into the page's `toc` export, in document
 * order. Creates the export if absent. If the export contains a TOC slice
 * (unsupported edge case), leaves it untouched.
 */
export function mergeReadmeTocs(
  tree: any,
  readmes: { node: any; entries: TocEntry[] }[],
): void {
  if (readmes.length === 0) return;

  let target = findTocExport(tree);
  if (!target) {
    tree.children.push(makeTocExportNode([]));
    target = findTocExport(tree)!;
  }

  let items: TocItem[];
  try {
    items = readTocItems(target.declarator.init);
  } catch (err) {
    if (err instanceof TocSliceError) return; // page uses TOC slices: unsupported
    throw err;
  }

  for (const { node, entries } of readmes) {
    const precedingId = precedingHeadingId(tree, node);
    items = insertReadmeToc(items, precedingId, buildTocItems(entries));
  }

  target.declarator.init = writeTocItems(items);
}
