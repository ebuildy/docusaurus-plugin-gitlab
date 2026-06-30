import type { TocEntry } from "../gitlab/toc.js";

/** A single right-sidebar TOC entry, matching Docusaurus' `toc` export shape. */
export interface TocItem {
  value: string;
  id: string;
  level: number;
  children: TocItem[];
}

/** Nest flat heading entries into a level-based tree (README's own min level = root). */
export function buildTocItems(entries: TocEntry[]): TocItem[] {
  if (entries.length === 0) return [];
  const root: TocItem[] = [];
  const minLevel = Math.min(...entries.map((e) => e.level));
  const stack: { level: number; list: TocItem[] }[] = [{ level: minLevel, list: root }];
  for (const entry of entries) {
    const item: TocItem = { value: entry.text, id: entry.id, level: entry.level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level > entry.level) stack.pop();
    let top = stack[stack.length - 1];
    if (entry.level > top.level) {
      const last = top.list[top.list.length - 1];
      const childList = last ? last.children : top.list;
      stack.push({ level: entry.level, list: childList });
      top = stack[stack.length - 1];
    }
    top.list.push(item);
  }
  return root;
}

/**
 * Insert `readmeItems` into a copy of `items` at the position following the
 * page heading with id `precedingId`:
 *  - precedingId === null  → prepend (component sits before all page headings)
 *  - README is deeper than the preceding heading → nest under it
 *  - otherwise → insert as following siblings
 *  - preceding id not found → append at root
 * Pure: never mutates the inputs.
 */
export function insertReadmeToc(
  items: TocItem[],
  precedingId: string | null,
  readmeItems: TocItem[],
): TocItem[] {
  if (readmeItems.length === 0) return items;
  const block = structuredClone(readmeItems);
  if (precedingId === null) return [...block, ...structuredClone(items)];

  const copy = structuredClone(items);
  const readmeMinLevel = Math.min(...readmeItems.map((i) => i.level));

  const recur = (list: TocItem[]): boolean => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === precedingId) {
        if (readmeMinLevel > list[i].level) list[i].children.push(...block);
        else list.splice(i + 1, 0, ...block);
        return true;
      }
      if (recur(list[i].children)) return true;
    }
    return false;
  };

  if (!recur(copy)) return [...copy, ...block];
  return copy;
}
