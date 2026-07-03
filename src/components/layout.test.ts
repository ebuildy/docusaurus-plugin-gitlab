import { describe, it, expect } from "vitest";
import { cardsGridStyle } from "./layout";

describe("cardsGridStyle", () => {
  it("is empty when no layout props are given (CSS defaults apply)", () => {
    expect(cardsGridStyle({})).toEqual({});
  });

  it("lays out a fixed number of columns via cardColumns", () => {
    expect(cardsGridStyle({ cardColumns: 3 })).toEqual({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    });
  });

  it("builds a responsive auto-fill grid from cardMinWidth", () => {
    expect(cardsGridStyle({ cardMinWidth: "220px" })).toEqual({
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    });
  });

  it("lets cardColumns win over cardMinWidth", () => {
    expect(cardsGridStyle({ cardColumns: 2, cardMinWidth: "220px" })).toEqual({
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    });
  });

  it("passes gap and maxWidth through and centers via align", () => {
    expect(cardsGridStyle({ gap: "1.5rem", maxWidth: "900px", align: "center" })).toEqual({
      gap: "1.5rem",
      maxWidth: "900px",
      marginLeft: "auto",
      marginRight: "auto",
    });
  });
});
