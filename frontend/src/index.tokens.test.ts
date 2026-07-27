import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// package.json sets "type": "module", so __dirname does not exist here.
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "index.css"), "utf8");

/** Grab a token's value from the :root block (first match) or .dark block. */
function tokenValue(name: string, scope: "light" | "dark"): string {
  const start = scope === "light" ? css.indexOf(":root {") : css.indexOf(".dark {");
  const block = css.slice(start, css.indexOf("\n}", start));
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
  if (!m) throw new Error(`token ${name} not found in ${scope} block`);
  return m[1].trim();
}

describe("colour token contract", () => {
  it("keeps --text-3 above the 4.5:1 floor on sand (spec D2)", () => {
    // #8a8478 is the artifact value and measures 3.29:1 on #f4f1ea.
    expect(tokenValue("--text-3", "light")).toBe("#6f6a5e");
  });

  it("restores the legacy border weight, not the artifact's hairline", () => {
    // Legacy #b0b0a3 was 2.19:1. alpha .10 = 1.22:1, .16 = 1.40:1 — both regress it.
    expect(tokenValue("--border", "light")).toBe("rgba(20, 25, 35, 0.35)");
    expect(tokenValue("--border", "dark")).toBe("rgba(255, 255, 255, 0.24)");
  });

  it("keeps --border-light as the deliberate decorative hairline", () => {
    expect(tokenValue("--border-light", "light")).toBe("rgba(20, 25, 35, 0.1)");
    expect(tokenValue("--border-light", "dark")).toBe("rgba(255, 255, 255, 0.08)");
  });

  it("resolves --violet to ink in both themes (spec D3)", () => {
    expect(tokenValue("--violet", "light")).toBe("#2b3646");
    expect(tokenValue("--violet", "dark")).toBe("#c5d0ca");
  });
});

const scannerSrc = readFileSync(resolve(here, "../scripts/scan-palette.mjs"), "utf8");

describe("scanner whitelist parity", () => {
  it("includes every literal (non-color-mix) badge and violet tint value", () => {
    // Literal hex/rgba values from index.css that are NOT authored via
    // color-mix() and therefore must appear in the scanner's OK arrays.
    const mustAppear = [
      "#eceef1",        // --violet-tint (light)
      "#c5d0ca@0.12",   // --violet-tint (dark)
      "#c5d0ca@0.32",   // --violet-tint-border (dark)
      "#141923@0.55",   // --modal-scrim (light)
      "#000000@0.62",   // --modal-scrim (dark)
    ];
    for (const v of mustAppear) {
      expect(scannerSrc.includes(v), `scanner is missing ${v}`).toBe(true);
    }
  });
});
