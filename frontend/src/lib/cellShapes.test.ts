import { describe, expect, it } from "vitest";
import { asShape, displayText, type CellShape } from "./cellShapes";

describe("asShape", () => {
  it("narrows a tagged shape", () => {
    const shape = asShape({ kind: "kv", pairs: [{ key: "Cap", value: "10%" }] });
    expect(shape?.kind).toBe("kv");
  });

  it("rejects untagged payloads rather than re-deriving the kind", () => {
    // Key-sniffing lives only in the backend's normalize_shape. Duplicating it
    // here is what let the two sides drift, so an untagged payload is null.
    expect(asShape({ pairs: [{ key: "Cap", value: "10%" }] })).toBeNull();
    expect(asShape({ summary: "s", body: "b" })).toBeNull();
    expect(asShape({ items: [] })).toBeNull();
  });

  it("rejects unknown kinds, primitives, arrays, and null", () => {
    expect(asShape({ kind: "sankey", nodes: [] })).toBeNull();
    expect(asShape(null)).toBeNull();
    expect(asShape(undefined)).toBeNull();
    expect(asShape("Yes")).toBeNull();
    expect(asShape(12.5)).toBeNull();
    expect(asShape([{ kind: "kv" }])).toBeNull();
  });
});

describe("displayText", () => {
  it("renders a kv shape as text, never as JSON", () => {
    // The regression this contract exists to prevent: the cell-detail panel
    // dumping `{"pairs": [...]}` at the analyst.
    const shape: CellShape = {
      kind: "kv",
      pairs: [
        { key: "Ongoing", value: "2.00% of commitments", unit: "percent" },
        { key: "One-time", value: "$1.25 million cap", unit: "USD" },
      ],
    };

    const full = displayText(shape);
    expect(full).toBe("- Ongoing: 2.00% of commitments percent\n- One-time: $1.25 million cap USD");
    expect(full).not.toContain("{");
    expect(full).not.toContain("pairs");
    expect(displayText(shape, true)).toBe(
      "Ongoing: 2.00% of commitments percent; One-time: $1.25 million cap USD"
    );
  });

  it("renders list shapes as markdown bullets or numbers", () => {
    const items = [{ text: "One" }, { text: "Two" }];
    expect(displayText({ kind: "list", ordered: false, items })).toBe("- One\n- Two");
    expect(displayText({ kind: "list", ordered: true, items })).toBe("1. One\n2. Two");
    expect(displayText({ kind: "list", ordered: false, items }, true)).toBe("One; Two");
  });

  it("prefers body for prose, summary when compact", () => {
    const shape: CellShape = { kind: "prose", summary: "Short.", body: "The long body.", caveats: [] };
    expect(displayText(shape)).toBe("The long body.");
    expect(displayText(shape, true)).toBe("Short.");
  });

  it("renders scalar shapes", () => {
    expect(displayText({ kind: "bool", value: true })).toBe("Yes");
    expect(displayText({ kind: "bool", value: false })).toBe("No");
    expect(displayText({ kind: "date", iso: "2026-03-31", granularity: "day" })).toBe("2026-03-31");
    expect(displayText({ kind: "enum", value: "Medium" })).toBe("Medium");
    expect(displayText({ kind: "currency", codes: ["USD", "EUR"] })).toBe("USD, EUR");
    expect(displayText({ kind: "metric", value: 50.4, unit: "$M", raw: "$50.4M" })).toBe("$50.4M");
    expect(displayText({ kind: "metric", value: 50.4, unit: "$M" })).toBe("50.4 $M");
  });

  it("appends a period only when the raw text does not already carry it", () => {
    expect(
      displayText({ kind: "metric", value: 50.4, unit: "$M", period: "FY2024", raw: "$50.4M FY2024" })
    ).toBe("$50.4M FY2024");
    expect(displayText({ kind: "metric", value: 50.4, unit: "$M", period: "FY2024" })).toBe(
      "50.4 $M (FY2024)"
    );
  });

  it("returns empty string for anything that is not a shape", () => {
    expect(displayText(null)).toBe("");
    expect(displayText(undefined)).toBe("");
    expect(displayText({ pairs: [] })).toBe("");
    expect(displayText({ kind: "kv", pairs: [] })).toBe("");
  });
});
