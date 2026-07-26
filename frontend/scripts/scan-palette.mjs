/**
 * Off-palette colour scanner. Walks every visible element on the app routes in
 * both themes and reports any computed colour that is not in the design system.
 *
 * Alpha is kept in the comparison key on purpose: rgba(255,255,255,.14) is the
 * dark --border, and collapsing it to #ffffff would report a false positive.
 *
 * Usage: node scripts/scan-palette.mjs [baseUrl]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] || "http://localhost:5199";

const SHARED = ["#a3402f", "#8a3223", "#f2e5e1", "#c0392b", "#c98a2b", "#2f6b4f"];

const BADGES_LIGHT = [
  "#f8efed", "#8d3020", "#db9f95", "#f8f2ed", "#6f4725", "#c9a98d",
  "#f7f5ed", "#5e4f21", "#bdac7a", "#f2f6ee", "#3e5b29", "#9ab587",
  "#eff6f2", "#2d5c45", "#91b6a3", "#eef5f6", "#2c5963", "#90b4bb",
  "#eef2f6", "#365278", "#a0b0c5", "#f6eef4", "#783662", "#c7a3bb",
];
const BADGES_DARK = [
  "#401d17", "#e5a59a", "#894134", "#302318", "#d2a884", "#6c5037",
  "#2c2617", "#c9b373", "#605534", "#20281a", "#99bf7d", "#4a5c3d",
  "#1d2a24", "#88bfa3", "#425c4f", "#1c292c", "#87bac4", "#3f5a5f",
  "#202832", "#9fb4d0", "#47576b", "#32202c", "#d2a3c2", "#714b65",
];

const LIGHT_OK = [
  ...SHARED, ...BADGES_LIGHT,
  "#ffffff", "#faf8f3", "#f4f1ea", "#16202e", "#2b3646", "#6f6a5e",
  "#c9c4b8", "#efeae0",
  "#141923@0.34", "#141923@0.1",
];
const DARK_OK = [
  ...SHARED, ...BADGES_DARK,
  "#0e1a17", "#14231e", "#12201c", "#eaf0ec", "#c5d0ca", "#7f938a",
  "#c47a5f", "#d18f76", "#d9614e", "#d9a854", "#5aa37d", "#16261f", "#2a3b35",
  "#ffffff@0.24", "#ffffff@0.08",
];

const ROUTES = [
  ["app-home", "/app"],
  ["workspace", "/deal/acme_saas"],
  ["portfolio", "/portfolio"],
];

const hex = (s) => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(s || "");
  if (!m) return null;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  if (a === 0) return null;
  const h = (n) => (+n).toString(16).padStart(2, "0");
  return "#" + h(m[1]) + h(m[2]) + h(m[3]) + (a < 1 ? "@" + a : "");
};

const collect = () =>
  Array.from(document.querySelectorAll("body *")).flatMap((el) => {
    if (/^(script|style|meta|link|title|head|svg|path|defs|g)$/i.test(el.tagName)) return [];
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return [];
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return [];
    const tag = el.tagName.toLowerCase();
    const cls = (typeof el.className === "string" ? el.className : "").slice(0, 45);
    const where = cls ? `${tag}.${cls.trim().split(/\s+/).slice(0, 2).join(".")}` : tag;
    const out = [];
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (ownText) out.push({ prop: "color", val: cs.color, where });
    out.push({ prop: "bg", val: cs.backgroundColor, where });
    if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none")
      out.push({ prop: "border", val: cs.borderTopColor, where });
    return out;
  });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const inputs = page.locator("input");
await inputs.nth(0).fill("admin@vyntic.com");
await inputs.nth(1).fill("admin");
await page.getByRole("button", { name: /continue/i }).click();
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
await page.waitForTimeout(1500);

let total = 0;
for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => localStorage.setItem("vyntic_theme", t), theme);
  const OK = theme === "light" ? LIGHT_OK : DARK_OK;
  for (const [name, route] of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const rows = await page.evaluate(collect);
    const tally = {};
    for (const r of rows) {
      const h = hex(r.val);
      if (!h || OK.includes(h)) continue;
      tally[h] = tally[h] || { n: 0, where: new Set() };
      tally[h].n++;
      if (tally[h].where.size < 3) tally[h].where.add(r.where);
    }
    const keys = Object.keys(tally);
    total += keys.length;
    console.log(`${name}-${theme}: ${keys.length} off-palette`);
    for (const k of keys.sort((a, b) => tally[b].n - tally[a].n))
      console.log(`    ${k}  x${tally[k].n}  ${[...tally[k].where].join(" , ")}`);
  }
}

await browser.close();
console.log(total === 0 ? "\nPASS — zero off-palette colours" : `\nFAIL — ${total} off-palette colours`);
process.exit(total === 0 ? 0 : 1);
