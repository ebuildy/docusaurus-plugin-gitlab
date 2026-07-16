import type {
  RoadmapData,
  RoadmapGroup,
  RoadmapItemData,
  RoadmapPositionedItem,
  RoadmapScale,
  RoadmapSource,
  ScaleTick,
} from "./types.js";

const MS_PER_DAY = 86_400_000;
const MIN_WIDTH_PCT = 1; // keep zero-length/point items visible
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(iso: string): number {
  // Tolerate a full datetime ("2026-03-01T00:00:00Z") by taking the date part only.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function spanDays(startISO: string, endISO: string): number {
  return (parseDay(endISO) - parseDay(startISO)) / MS_PER_DAY;
}

/** Round a timestamp down to the start of its scale unit (Monday / 1st / quarter). */
function snapDown(ms: number, scale: RoadmapScale): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (scale === "weeks") {
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const backToMonday = day === 0 ? 6 : day - 1;
    return ms - backToMonday * MS_PER_DAY;
  }
  if (scale === "months") return Date.UTC(y, m, 1);
  return Date.UTC(y, Math.floor(m / 3) * 3, 1); // quarters
}

/** Advance a boundary timestamp by exactly one scale unit. */
function advance(ms: number, scale: RoadmapScale): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (scale === "weeks") return ms + 7 * MS_PER_DAY;
  if (scale === "months") return Date.UTC(y, m + 1, 1);
  return Date.UTC(y, m + 3, 1); // quarters
}

/** Round a timestamp up to the next scale boundary (unchanged if already on one). */
function snapUp(ms: number, scale: RoadmapScale): number {
  const down = snapDown(ms, scale);
  return down === ms ? ms : advance(down, scale);
}

export function selectScale(startISO: string, endISO: string): RoadmapScale {
  const days = spanDays(startISO, endISO);
  // ~a quarter (92d) → weeks; ~a year (366d) → months; longer → quarters
  if (days <= 92) return "weeks";
  if (days <= 366) return "months";
  return "quarters";
}

/** Raw min-start / max-due across items (falling back to the other date). */
function rawBounds(items: RoadmapItemData[]): { startISO: string; endISO: string } {
  const starts = items.map((i) => i.startDate ?? i.dueDate!).filter(Boolean);
  const ends = items.map((i) => i.dueDate ?? i.startDate!).filter(Boolean);
  const startMs = Math.min(...starts.map(parseDay));
  const endMs = Math.max(...ends.map(parseDay));
  return { startISO: toISODate(startMs), endISO: toISODate(endMs) };
}

function deriveWindow(
  items: RoadmapItemData[],
  scale: RoadmapScale,
  from: string | undefined,
  to: string | undefined,
): { rangeStart: string; rangeEnd: string } {
  const raw = rawBounds(items);
  const startMs = from ? parseDay(from) : snapDown(parseDay(raw.startISO), scale);
  let endMs = to ? parseDay(to) : snapUp(parseDay(raw.endISO), scale);
  if (endMs <= startMs) endMs = advance(startMs, scale); // guarantee a positive window
  return { rangeStart: toISODate(startMs), rangeEnd: toISODate(endMs) };
}

export function positionItem(
  it: RoadmapItemData,
  rangeStart: string,
  rangeEnd: string,
): { offsetPct: number; widthPct: number } {
  const s = parseDay(it.startDate ?? it.dueDate!);
  const e = parseDay(it.dueDate ?? it.startDate!);
  const total = parseDay(rangeEnd) - parseDay(rangeStart);
  const offsetPct = Math.min(Math.max(((s - parseDay(rangeStart)) / total) * 100, 0), 100);
  const rawWidth = ((e - s) / total) * 100;
  const widthPct = Math.max(Math.min(rawWidth, 100 - offsetPct), MIN_WIDTH_PCT);
  return { offsetPct, widthPct };
}

function tickLabel(ms: number, scale: RoadmapScale): string {
  const d = new Date(ms);
  if (scale === "quarters") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (scale === "weeks") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return MONTHS[d.getUTCMonth()];
}

export function buildTicks(rangeStart: string, rangeEnd: string, scale: RoadmapScale): ScaleTick[] {
  const startMs = parseDay(rangeStart);
  const endMs = parseDay(rangeEnd);
  const total = endMs - startMs;
  const ticks: ScaleTick[] = [];
  for (let cur = startMs; cur < endMs; cur = advance(cur, scale)) {
    ticks.push({
      label: tickLabel(cur, scale),
      offsetPct: ((cur - startMs) / total) * 100,
      date: toISODate(cur),
    });
  }
  return ticks;
}

export function groupItems(
  items: RoadmapPositionedItem[],
  groupBy: "none" | "label" | "parent",
): RoadmapGroup[] {
  if (groupBy === "none") return [{ key: "all", title: null, items }];
  const map = new Map<string, RoadmapGroup>();
  for (const it of items) {
    const keys =
      groupBy === "label"
        ? it.labels.length
          ? it.labels.map((l) => l.name)
          : ["(no label)"]
        : [it.parentTitle ?? "(no parent)"];
    for (const k of keys) {
      const g = map.get(k) ?? { key: k, title: k, items: [] };
      g.items.push(it);
      map.set(k, g);
    }
  }
  // Array.from (not spread) so a bundler with loose/array-like spread assumptions
  // can't mis-compile this Map-iterator drain — see roadmapDateGroups.ts.
  return Array.from(map.values());
}

function sortItems(items: RoadmapItemData[], order: "start" | "due" | "title"): RoadmapItemData[] {
  const key = (i: RoadmapItemData): string =>
    order === "title" ? i.title : order === "due" ? i.dueDate ?? i.startDate ?? "" : i.startDate ?? i.dueDate ?? "";
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

export interface BuildRoadmapOptions {
  source: RoadmapSource;
  order: "start" | "due" | "title";
  groupBy: "none" | "label" | "parent";
  scale?: RoadmapScale;
  from?: string;
  to?: string;
}

export function buildRoadmap(items: RoadmapItemData[], opts: BuildRoadmapOptions): RoadmapData {
  const dated = items.filter((i) => i.startDate || i.dueDate);
  if (dated.length === 0) {
    return {
      source: opts.source,
      scale: opts.scale ?? "months",
      rangeStart: opts.from ?? "",
      rangeEnd: opts.to ?? "",
      ticks: [],
      groups: [],
    };
  }
  const sorted = sortItems(dated, opts.order);
  const raw = rawBounds(sorted);
  const scale = opts.scale ?? selectScale(raw.startISO, raw.endISO);
  const { rangeStart, rangeEnd } = deriveWindow(sorted, scale, opts.from, opts.to);
  const positioned: RoadmapPositionedItem[] = sorted.map((i) => ({
    ...i,
    ...positionItem(i, rangeStart, rangeEnd),
  }));
  return {
    source: opts.source,
    scale,
    rangeStart,
    rangeEnd,
    ticks: buildTicks(rangeStart, rangeEnd, scale),
    groups: groupItems(positioned, opts.groupBy),
  };
}
