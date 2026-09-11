import { describe, expect, it } from "vitest";

import { cellLabel, parseCellLabel } from "@/lib/domain/mapConfig";

describe("cellLabel", () => {
  it("labels the origin A1", () => {
    expect(cellLabel({ col: 0, row: 0 })).toBe("A1");
  });

  it("labels columns and rows independently", () => {
    expect(cellLabel({ col: 3, row: 6 })).toBe("D7");
    expect(cellLabel({ col: 25, row: 0 })).toBe("Z1");
  });

  it("wraps past Z into AA, AB, ...", () => {
    expect(cellLabel({ col: 26, row: 0 })).toBe("AA1");
    expect(cellLabel({ col: 27, row: 0 })).toBe("AB1");
    expect(cellLabel({ col: 51, row: 0 })).toBe("AZ1");
    expect(cellLabel({ col: 52, row: 0 })).toBe("BA1");
  });

  it("re-bases negative authored coordinates to start at A1", () => {
    // A calibration origin isn't guaranteed to land on the buildable
    // area's own corner, so authored cells can be negative — the label
    // still has to read naturally from the map's actual extent.
    const origin = { col: -3, row: -2 };
    expect(cellLabel({ col: -3, row: -2 }, origin)).toBe("A1");
    expect(cellLabel({ col: 0, row: 0 }, origin)).toBe("D3");
  });

  it("rounds fractional input rather than mislabeling it", () => {
    expect(cellLabel({ col: 2.9, row: 5.1 })).toBe("D6");
  });
});

describe("parseCellLabel", () => {
  it("inverts cellLabel across a range of cells", () => {
    for (const cell of [
      { col: 0, row: 0 },
      { col: 3, row: 6 },
      { col: 25, row: 0 },
      { col: 26, row: 0 },
      { col: 51, row: 12 },
      { col: 52, row: 99 },
    ]) {
      expect(parseCellLabel(cellLabel(cell))).toEqual(cell);
    }
  });

  it("accepts lowercase and trims whitespace", () => {
    expect(parseCellLabel(" d7 ")).toEqual({ col: 3, row: 6 });
  });

  it("respects a non-zero origin symmetrically with cellLabel", () => {
    const origin = { col: -3, row: -2 };
    expect(parseCellLabel("A1", origin)).toEqual({ col: -3, row: -2 });
    expect(parseCellLabel("D3", origin)).toEqual({ col: 0, row: 0 });
  });

  it("returns null for unparseable input", () => {
    expect(parseCellLabel("")).toBeNull();
    expect(parseCellLabel("7")).toBeNull();
    expect(parseCellLabel("D")).toBeNull();
    expect(parseCellLabel("D-7")).toBeNull();
  });
});
