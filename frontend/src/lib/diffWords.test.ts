import { describe, expect, it } from "vitest";
import { diffWords } from "./diffWords";

describe("diffWords", () => {
  it("returns one match segment for identical strings", () => {
    const result = diffWords("the quick brown fox", "the quick brown fox");
    expect(result.segments).toEqual([{ kind: "match", text: "the quick brown fox" }]);
    expect(result.stats).toEqual({ total: 4, matched: 4, overlap: 1 });
  });

  it("tags substituted words as diff and merges adjacent segments", () => {
    const result = diffWords("the quick brown fox", "the slow brown fox");
    expect(result.segments).toEqual([
      { kind: "match", text: "the " },
      { kind: "diff", text: "slow " },
      { kind: "match", text: "brown fox" },
    ]);
    expect(result.stats).toEqual({ total: 4, matched: 3, overlap: 3 / 4 });
  });

  it("tags appended words as diff", () => {
    const result = diffWords("revenue grew", "revenue grew significantly");
    expect(result.segments).toEqual([
      { kind: "match", text: "revenue grew " },
      { kind: "diff", text: "significantly" },
    ]);
    expect(result.stats.matched).toBe(2);
    expect(result.stats.total).toBe(3);
  });

  it("matches case- and punctuation-insensitively but preserves surface form", () => {
    const result = diffWords("Revenue grew.", "revenue GREW!");
    expect(result.segments).toEqual([{ kind: "match", text: "revenue GREW!" }]);
    expect(result.stats.overlap).toBe(1);
  });

  it("treats everything as diff when the anchor is empty", () => {
    const result = diffWords("", "brand new text");
    expect(result.segments).toEqual([{ kind: "diff", text: "brand new text" }]);
    expect(result.stats).toEqual({ total: 0, matched: 0, overlap: 0 });
  });

  it("returns no segments when the other side is empty", () => {
    const result = diffWords("anchor text", "");
    expect(result.segments).toEqual([]);
    expect(result.stats).toEqual({ total: 0, matched: 0, overlap: 0 });
  });
});
