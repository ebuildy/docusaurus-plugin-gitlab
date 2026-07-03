import type { CSSProperties } from "react";

/**
 * Generic, reusable layout props for components that render a grid of cards.
 * Kept separate from any single component so other card-based components can
 * `extends ComponentLayout` and share the same knobs + `cardsGridStyle`.
 */
export interface ComponentLayout {
  /** Fixed number of columns for the cards grid. Wins over `cardMinWidth`. */
  cardColumns?: number;
  /** Minimum card width for a responsive (auto-fill) cards grid, e.g. "220px". */
  cardMinWidth?: string;
  /** Spacing between cards, e.g. "1.5rem". */
  gap?: string;
  /** Constrain the cards grid width, e.g. "900px". */
  maxWidth?: string;
  /** Horizontal placement of a width-constrained cards grid. */
  align?: "start" | "center";
}

/** Build the inline style for a cards-grid container from the layout props. */
export function cardsGridStyle({
  cardColumns,
  cardMinWidth,
  gap,
  maxWidth,
  align,
}: ComponentLayout): CSSProperties {
  const style: CSSProperties = {};
  if (cardColumns && cardColumns > 0) {
    style.gridTemplateColumns = `repeat(${cardColumns}, minmax(0, 1fr))`;
  } else if (cardMinWidth) {
    style.gridTemplateColumns = `repeat(auto-fill, minmax(${cardMinWidth}, 1fr))`;
  }
  if (gap) style.gap = gap;
  if (maxWidth) style.maxWidth = maxWidth;
  if (align === "center") {
    style.marginLeft = "auto";
    style.marginRight = "auto";
  }
  return style;
}
