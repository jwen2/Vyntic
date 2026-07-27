/**
 * Typography Phase 2 spike — reflow measurement.
 *
 * Captures screenshots and layout metrics (row/cell height, horizontal
 * overflow) for the four data-dense screens named in the oxblood-reskin
 * design spec §6 (docs/superpowers/specs/2026-07-26-oxblood-reskin-design.md),
 * before and after the --sans font-family swap (IBM Plex Sans -> Hanken
 * Grotesk). See docs/superpowers/plans/2026-07-26-typography-phase2-spike.md.
 *
 * The "after" run reuses a saved storageState so the DocMatrix column
 * (client-only, localStorage-persisted — see useDocMatrix.ts) holds the same
 * content both times: only the font should differ between the two capture
 * sets, not the text being measured.
 *
 * Usage: node scripts/measure-reflow.mjs <before|after> [baseUrl]
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const MODE = process.argv[2];
if (MODE !== "before" && MODE !== "after") {
  console.error("Usage: node scripts/measure-reflow.mjs <before|after> [baseUrl]");
  process.exit(1);
}
const BASE = process.argv[3] || "http://localhost:5199";
const OUT_DIR = `.reflow-snapshots/${MODE}`;
const STATE_PATH = ".reflow-snapshots/storage-state.json";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 1000 },
  storageState: MODE === "after" && existsSync(STATE_PATH) ? STATE_PATH : undefined,
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
if (page.url().includes("login")) {
  const inputs = page.locator("input");
  await inputs.nth(0).fill("admin@vyntic.com");
  await inputs.nth(1).fill("admin");
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 20000 });
}
await page.waitForTimeout(1000);

// Rows/cells Vyntic marks single-line (whiteSpace: nowrap or Tailwind's
// `truncate`) are exactly where a wider font pushes text into clipping —
// scrollWidth > clientWidth catches that regardless of visual inspection.
const measure = () =>
  Array.from(document.querySelectorAll("tr, td, th")).map((el) => {
    const cs = getComputedStyle(el);
    const overflowing =
      (cs.whiteSpace === "nowrap" || el.classList.contains("truncate")) &&
      el.scrollWidth > el.clientWidth + 1;
    return {
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").slice(0, 40),
      height: Math.round(el.getBoundingClientRect().height),
      width: Math.round(el.getBoundingClientRect().width),
      overflowing,
    };
  });

const results = {};

async function capture(name, selector) {
  await page.waitForSelector(selector, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.locator(selector).first().screenshot({ path: `${OUT_DIR}/${name}.png` });
  results[name] = await page.evaluate(measure);
  console.log(`  captured ${name}: ${results[name].length} row/cell elements`);
}

for (const theme of ["light", "dark"]) {
  console.log(`\n== ${theme} ==`);
  await page.evaluate((t) => localStorage.setItem("vyntic_theme", t), theme);

  // 1. FinancialPanel — deal workspace, Brief tab
  await page.goto(`${BASE}/deal/acme_saas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Brief" }).click();
  await page.waitForTimeout(1500);
  const runScanBtn = page.getByRole("button", { name: /run proactive scan/i });
  if (await runScanBtn.isVisible().catch(() => false)) {
    await runScanBtn.click();
    await page.waitForTimeout(500);
    await page.waitForSelector("table", { timeout: 180000 }); // full scan can be slow
  }
  await capture(`financial-panel-${theme}`, "table");

  // 2. DocMatrixTable — deals list, acme_saas row. Client-only state: add one
  // query the first time through ("before"), then reuse it via storageState.
  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.getByText("acme_saas", { exact: false }).first().click();
  await page.waitForTimeout(1000);
  const askBox = page.getByLabel("Ask a question across all documents");
  if (await askBox.isVisible().catch(() => false)) {
    await askBox.fill("What is the target's FY2025 revenue?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.waitForSelector("table", { timeout: 60000 });
    await page.waitForTimeout(1000);
    await ctx.storageState({ path: STATE_PATH });
  }
  await capture(`docmatrix-table-${theme}`, "table");

  // 3. TabularEditor — Workflows tab, clone the "QofE Bridge" built-in (8
  // columns, pre-filled — no run needed to see a populated editor).
  //
  // Selector note vs. brief draft: `text=QofE Bridge` is a substring match,
  // so once a clone exists (named "QofE Bridge (Copy)" server-side — see
  // workflow_store.clone_workflow) it also matches, and the ancestor xpath
  // resolves to multiple cards (strict-mode violation). Scope to the article
  // whose title is the *exact* built-in name instead. Also: cloning the same
  // built-in twice (e.g. the dark-theme pass, after light already cloned it)
  // surfaces a "You already have a copy" ConfirmDialog (WorkflowsView.tsx
  // handleClone) rather than cloning again — handle both paths.
  await page.goto(`${BASE}/deal/acme_saas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Workflows" }).click();
  await page.waitForTimeout(1000);
  const qofeCard = page.locator("article").filter({ has: page.getByText("QofE Bridge", { exact: true }) });
  await qofeCard.getByRole("button", { name: "Clone to edit" }).click();
  await page.waitForTimeout(300);
  const alreadyCopiedDialog = page.getByText("You already have a copy");
  if (await alreadyCopiedDialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Open existing copy" }).click();
  }
  await page.waitForSelector('input[placeholder="Workflow name"]', { timeout: 20000 });
  await capture(`tabular-editor-${theme}`, "table");

  // 4. RunTable — reuse existing run history if present, else trigger one.
  await page.goto(`${BASE}/deal/acme_saas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Workflows" }).click();
  await page.waitForTimeout(1000);
  const card = page.locator("article").filter({ has: page.getByText("QofE Bridge", { exact: true }) });
  await card.getByRole("button", { name: "History" }).click();
  await page.waitForTimeout(1000);
  const firstRun = page.locator("tr, li").filter({ hasText: /\d/ }).first();
  if (await firstRun.isVisible().catch(() => false)) {
    await firstRun.click();
  } else {
    // RunHistoryModal (WorkflowsView.tsx) is a bespoke overlay, not the
    // shared Modal component — it has no Escape handler, only backdrop
    // click. Click the backdrop (outside the right-anchored panel) instead.
    await page.mouse.click(20, 20);
    await page.waitForTimeout(300);
    await card.getByRole("button", { name: "Run extraction" }).click();
    await page.getByRole("button", { name: "Select all" }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.waitForSelector("table", { timeout: 240000 }); // real extraction run
  }
  await capture(`run-table-${theme}`, "table");
}

await browser.close();
writeFileSync(`${OUT_DIR}/metrics.json`, JSON.stringify(results, null, 2));
console.log(`\n${MODE} snapshot complete -> ${OUT_DIR}/`);
