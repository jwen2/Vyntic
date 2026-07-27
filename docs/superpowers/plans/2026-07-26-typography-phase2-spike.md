# Typography Phase 2 — Reflow Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine whether swapping the app's `--sans` font family from IBM Plex Sans to Hanken Grotesk (per `docs/superpowers/specs/2026-07-26-oxblood-reskin-design.md` D5) reflows the four data-dense screens the spec names in §6, so the real Phase 2 sweep plan (~430 inline `fontSize` sites across 44 files, tracked in `docs/todo/README.md`'s RS1 row) can be decomposed against measured risk instead of an assumption.

**Architecture:** Land the three new font families and the D6 typography scale as inert CSS custom properties + Tailwind aliases first (zero visual change — nothing consumes them yet). Then flip only the handful of sites that actually resolve to a rendered font — `body`'s `font-family` plus three page-root inline-style overrides that currently hardcode `"IBM Plex Sans"` and would otherwise silently shadow the token change. Measure before that flip and after it, on the same seeded content, using a Playwright script modeled on `scripts/scan-palette.mjs`.

**Tech Stack:** React/TypeScript frontend (Vite, Tailwind), `playwright-core` (already pinned at `1.62.0` in `frontend/package.json` devDependencies — no new install needed) driving installed Edge headless, FastAPI/SQLite backend seeded via `ALLOW_INSECURE_DEFAULTS=1`.

## Global Constraints

- Do not touch any inline `fontSize` value on any component in this plan. The ~430-site sweep is out of scope — it's the *next* plan, which this spike's findings feed into.
- Do not touch `borderRadius` or the landing page's `--landing-*` system — out of scope per spec D4, same exclusion Phase 1 (colour) used.
- Keep `npx tsc --noEmit`, `npm run build`, and `npx vitest run` green after every task.
- CSS additions are additive-only — no renamed or removed custom properties, no changes to the 44 colour tokens.
- Screenshots and raw metrics JSON are spike evidence, not committed as binary blobs: `frontend/.reflow-snapshots/` is gitignored. Only the script and the written findings doc get committed.
- Local verification follows the `frontend:verify` skill: backend on an explicit port (`ALLOW_INSECURE_DEFAULTS=1`, e.g. `--port 8801`), frontend `npm run dev -- --port 5199 --strictPort` with `VITE_API_PROXY_TARGET` pointed at that backend port. Admin login is `admin@vyntic.com` / `admin`, owns the seeded `acme_saas` deal.

---

### Task 1: Font loading + typography tokens (inert)

**Files:**
- Modify: `frontend/src/index.css:1` (the `@import`)
- Modify: `frontend/src/index.css` (new token block, inserted before the `:root` block's closing brace at line 133)
- Modify: `frontend/tailwind.config.js` (add `fontFamily` + `fontSize` under `theme.extend`)

**Interfaces:**
- Produces: CSS custom properties `--sans`, `--serif`, `--mono` (D5 families, each with its own fallback chain) and `--text-display` / `--text-h1` / `--text-h2` / `--text-h3` / `--text-body` / `--text-sm` / `--text-meta` (D6, spec-verbatim) plus `--text-xs` / `--text-2xs` / `--text-meta-sm` (D6, app-side dense-tier extensions). Tailwind aliases: `font-sans` / `font-serif` / `font-mono` (fontFamily), `text-display` / `text-h1` / `text-h2` / `text-h3` / `text-body` / `text-sm` / `text-meta` / `text-xs` / `text-2xs` / `text-meta-sm` (fontSize, `[size, {lineHeight, fontWeight}]` tuples). Nothing in the app consumes any of these yet — no visual diff from this task alone.
- Consumes: nothing new.

- [x] **Step 1: Create the branch**

```bash
git checkout -b feat/typography-phase2-spike
```

- [x] **Step 2: Extend the font-loading `@import`**

Replace `frontend/src/index.css:1`:

```css
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap");
```

with:

```css
@import url("https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600&display=swap");
```

IBM Plex Mono stays loaded — `.font-mono-plex` has 89 call sites and is out of scope for this spike. IBM Plex Sans stays loaded too, as the fallback inside the new `--sans` token (Step 3) rather than the primary face.

- [x] **Step 3: Add the typography token block**

Insert immediately before the `:root` block's closing `}` (currently `frontend/src/index.css:133`):

```css
  /* ── Typography (spec D5/D6, Phase 2 spike) ─────────────────────────────
     Families and scale from the oxblood-reskin design artifact. Inert until
     something references them — see docs/superpowers/plans/
     2026-07-26-typography-phase2-spike.md for what does and doesn't yet. */
  --sans: 'Hanken Grotesk', 'IBM Plex Sans', 'Aptos', 'Segoe UI', sans-serif;
  --serif: 'Playfair Display', Georgia, serif;
  --mono: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* D6 scale, spec-verbatim. */
  --text-display: 600 52px/54px var(--serif);
  --text-h1: 600 38px/40px var(--serif);
  --text-h2: 600 28px/32px var(--serif);
  --text-h3: 600 22px/28px var(--serif);
  --text-body: 400 15px/24px var(--sans);
  --text-sm: 400 13.5px/20px var(--sans);
  --text-meta: 400 11px/16px var(--mono);

  /* D6 app-side extensions for the dense data UI — not in the artifact,
     documented here so nothing is passed off as spec. */
  --text-xs: 400 12px/16px var(--sans);
  --text-2xs: 400 10px/14px var(--sans);
  --text-meta-sm: 400 10px/14px var(--mono);
```

- [x] **Step 4: Add Tailwind aliases**

In `frontend/tailwind.config.js`, inside `theme.extend` (alongside the existing `colors` block):

```js
      fontFamily: {
        sans: ["var(--sans)"],
        serif: ["var(--serif)"],
        mono: ["var(--mono)"],
      },
      fontSize: {
        display: ["52px", { lineHeight: "54px", fontWeight: "600" }],
        h1: ["38px", { lineHeight: "40px", fontWeight: "600" }],
        h2: ["28px", { lineHeight: "32px", fontWeight: "600" }],
        h3: ["22px", { lineHeight: "28px", fontWeight: "600" }],
        body: ["15px", { lineHeight: "24px" }],
        meta: ["11px", { lineHeight: "16px" }],
        "2xs": ["10px", { lineHeight: "14px" }],
        "meta-sm": ["10px", { lineHeight: "14px" }],
      },
```

(`text-sm` and `text-xs` already exist as Tailwind defaults at 14px/12px and 12px/16px respectively — D6's `--text-sm` is 13.5px, one px off Tailwind's default. Leave Tailwind's built-in `sm`/`xs` scale alone here; reconciling those two is a sweep-plan decision, not this spike's.)

- [x] **Step 5: Verify no visual change**

```bash
cd frontend && npx tsc --noEmit && npm run build && npx vitest run
```

Expected: all green, identical to pre-change baseline — this task only adds unreferenced tokens.

Then with the dev server running (see Global Constraints), open the browser console on any page and run:

```js
await document.fonts.ready;
document.fonts.check("16px 'Hanken Grotesk'")
```

Expected: `true` (font loaded, not yet applied to anything).

This also fixes the latent `.font-mono-dm` bug (spec D5) — the class at `index.css:252` has always declared `font-family: "DM Mono", …`, but the `@import` never fetched DM Mono, so its 9 call sites (e.g. `FinancialPanel.tsx:226`, `AnswerText.tsx:133`) silently fell through to `ui-monospace`. Confirm the fix on `/deal/acme_saas` → Brief tab, once a financial table is visible:

```js
getComputedStyle(document.querySelector(".font-mono-dm")).fontFamily
```

Expected: starts with `"DM Mono"`, not a `ui-monospace`/system fallback.

- [x] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/tailwind.config.js
git commit -m "feat(frontend): load Hanken Grotesk/Playfair Display/DM Mono, add D6 typography tokens (inert)"
```

---

### Task 2: Reflow measurement script + "before" baseline

**Files:**
- Create: `frontend/scripts/measure-reflow.mjs`
- Modify: `frontend/package.json` (add `"measure:reflow": "node scripts/measure-reflow.mjs"` script entry)
- Modify: `.gitignore` (repo root — add `frontend/.reflow-snapshots/`)

**Interfaces:**
- Consumes: nothing from Task 1 directly — this task runs against Task 1's state (fonts loaded, nothing visually changed yet), which is exactly the "before" baseline for Task 3's swap.
- Produces: `frontend/.reflow-snapshots/before/*.png` + `metrics.json`, and `frontend/.reflow-snapshots/storage-state.json` (a Playwright storage-state snapshot capturing the DocMatrix query added during this run, so Task 4's "after" run reuses the *same* matrix content instead of asking a fresh LLM question and risking a different answer length skewing the comparison).

- [x] **Step 1: Write the script**

Create `frontend/scripts/measure-reflow.mjs`:

```js
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
  await page.goto(`${BASE}/deal/acme_saas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Workflows" }).click();
  await page.waitForTimeout(1000);
  const qofeCard = page.locator("text=QofE Bridge").locator("xpath=ancestor::*[.//button][1]");
  await qofeCard.getByRole("button", { name: "Clone to edit" }).click();
  await page.waitForSelector("text=/column/i", { timeout: 20000 });
  await capture(`tabular-editor-${theme}`, "body");

  // 4. RunTable — reuse existing run history if present, else trigger one.
  await page.goto(`${BASE}/deal/acme_saas`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Workflows" }).click();
  await page.waitForTimeout(1000);
  const card = page.locator("text=QofE Bridge").locator("xpath=ancestor::*[.//button][1]");
  await card.getByRole("button", { name: "History" }).click();
  await page.waitForTimeout(1000);
  const firstRun = page.locator("tr, li").filter({ hasText: /\d/ }).first();
  if (await firstRun.isVisible().catch(() => false)) {
    await firstRun.click();
  } else {
    await page.keyboard.press("Escape");
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
```

Selectors were derived from reading the component source (`WorkflowCard.tsx`, `MatrixAskHero.tsx`, `DocumentSelectorModal.tsx`, `EmptyBrief.tsx`, `LeftSidebar.tsx`) rather than a live DOM — expect to adjust one or two in Step 2 against the actual rendered app.

- [x] **Step 2: Add the gitignore entry and package.json script**

Add to `frontend/package.json` `scripts`:

```json
"measure:reflow": "node scripts/measure-reflow.mjs"
```

Add to the repo-root `.gitignore` (new line, anywhere in the file):

```
frontend/.reflow-snapshots/
```

- [x] **Step 3: Run the "before" baseline**

Start the backend and frontend per `frontend:verify` (backend `--port 8801` with `ALLOW_INSECURE_DEFAULTS=1`, frontend `npm run dev -- --port 5199 --strictPort` with `VITE_API_PROXY_TARGET=http://localhost:8801`). Then, from `frontend/`:

```bash
npm run measure:reflow -- before
```

Expected: exits 0, prints 4 `captured …` lines per theme (8 total), and `frontend/.reflow-snapshots/before/` contains 8 PNGs + `metrics.json`. If a selector fails (element not found / timeout), inspect the live page at that step with the browser open (drop `headless: true` temporarily) and correct the selector — this is expected iteration, not a plan error.

- [x] **Step 4: Commit**

```bash
git add frontend/scripts/measure-reflow.mjs frontend/package.json .gitignore
git commit -m "test(frontend): add reflow measurement script, capture pre-swap baseline"
```

---

### Task 3: The font-family swap

**Files:**
- Modify: `frontend/src/index.css:247` (`body` rule)
- Modify: `frontend/src/pages/DealWorkspacePage.tsx:264`
- Modify: `frontend/src/pages/HomePage.tsx:179`
- Modify: `frontend/src/pages/ManagerPage.tsx:61`

**Interfaces:**
- Consumes: `--sans` from Task 1.
- Produces: the actual rendered font change. Nothing later depends on new interfaces from this task — Task 4 just re-runs Task 2's script against this state.

Three page-root components set `fontFamily: "'IBM Plex Sans', sans-serif"` as an **inline style**, which wins the cascade over `body`'s CSS rule. Since these three roots wrap the entire deal workspace (`DealWorkspacePage`, containing Agent/Workflows/Brief/Monitoring — three of the four measurement screens) and the deals list (`HomePage`, containing `DocMatrixPanel` — the fourth), changing only `body` would produce a **false negative**: the script would report zero reflow because the font never actually changed anywhere the four screens render. All four sites must move together.

- [x] **Step 1: Repoint `body`**

In `frontend/src/index.css`, `body` rule (currently at line 245-250):

```css
body {
  margin: 0;
  font-family: "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
  color: var(--landing-text);
  background: var(--landing-bg);
}
```

becomes:

```css
body {
  margin: 0;
  font-family: var(--sans);
  color: var(--landing-text);
  background: var(--landing-bg);
}
```

(`--sans` already carries `'Aptos', 'Segoe UI', sans-serif` as fallbacks — see Task 1 Step 3.)

- [x] **Step 2: Repoint the three page-root inline styles**

`frontend/src/pages/DealWorkspacePage.tsx:264`, `frontend/src/pages/HomePage.tsx:179`, `frontend/src/pages/ManagerPage.tsx:61` each currently have:

```ts
fontFamily: "'IBM Plex Sans', sans-serif",
```

Change each to:

```ts
fontFamily: "var(--sans)",
```

- [x] **Step 3: Verify**

```bash
cd frontend && npx tsc --noEmit && npm run build && npx vitest run
```

Expected: all green.

With the dev server running, in the browser console on `/deal/acme_saas`:

```js
getComputedStyle(document.body).fontFamily
```

Expected: starts with `"Hanken Grotesk"` (quoting may vary by browser).

- [x] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/pages/DealWorkspacePage.tsx frontend/src/pages/HomePage.tsx frontend/src/pages/ManagerPage.tsx
git commit -m "feat(frontend): swap --sans to Hanken Grotesk app-wide (spike D5 metric-change measurement)"
```

---

### Task 4: "After" capture + findings

**Files:**
- Create: `docs/superpowers/spikes/2026-07-26-typography-phase2-reflow-findings.md`

**Interfaces:**
- Consumes: `frontend/.reflow-snapshots/{before,after}/metrics.json` and the PNGs, `frontend/.reflow-snapshots/storage-state.json` (Task 2).
- Produces: a decision record `docs/todo/README.md`'s RS1 row and the next Phase 2 sweep plan can cite directly.

- [x] **Step 1: Run the "after" capture**

With both servers still running (state from Task 3 applied):

```bash
cd frontend && npm run measure:reflow -- after
```

Expected: exits 0, `frontend/.reflow-snapshots/after/` contains the matching 8 PNGs + `metrics.json`. The DocMatrix screen should show the *same* question/answer as the "before" run (reused via `storage-state.json`) — if it instead re-prompts for a question, the `askBox` visibility check in the script didn't detect the existing state; fix before trusting the comparison.

- [x] **Step 2: Diff the metrics**

For each of the 8 `{screen}-{theme}` keys, compare `before/metrics.json` against `after/metrics.json`:
- Any row/cell whose `height` or `width` changed by more than a couple of px.
- Any element where `overflowing` flipped `false -> true`.
- Row count mismatches (would indicate something crashed rather than reflowed — re-run before trusting).

Visually diff the corresponding PNG pairs for anything the numeric check wouldn't catch (label wrapping that doesn't trigger `overflowing`, awkward vertical rhythm from Hanken's different line-height rendering, etc).

- [x] **Step 3: Write the findings doc**

Create `docs/superpowers/spikes/2026-07-26-typography-phase2-reflow-findings.md` covering, per screen (FinancialPanel, DocMatrixTable, TabularEditor, RunTable) x theme:
- Measured deltas (heights/widths/overflow flags) with the actual before/after numbers, not just pass/fail.
- Whether anything broke (row/column overflow, truncation, misalignment) and where specifically (element + screen).
- A recommendation for how the real Phase 2 sweep plan should sequence: e.g. "safe to run a straightforward largest-first inline-fontSize sweep" if nothing broke, or "FinancialPanel's mono-numeric columns need explicit width padding before the sweep starts" if something did. This is the actual deliverable the spike exists to produce — the next plan's task decomposition depends on it, per `docs/todo/README.md`'s RS1 row ("its decomposition depends on measured reflow").

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/spikes/2026-07-26-typography-phase2-reflow-findings.md
git commit -m "docs: typography Phase 2 reflow spike findings"
```

---

## Done when

- `frontend/.reflow-snapshots/{before,after}/` both exist locally with 8 PNGs + `metrics.json` each (not committed).
- `npx tsc --noEmit`, `npm run build`, and `npx vitest run` are green on the branch tip.
- `docs/superpowers/spikes/2026-07-26-typography-phase2-reflow-findings.md` exists with a concrete go/no-go/adjust recommendation for the real sweep plan.

## Deliberately not in this phase

- The ~430-site inline `fontSize` sweep (spec §7 Phase 2 steps 3-4) — this spike's findings inform how that gets task-decomposed, but writing that plan is separate follow-up work.
- `--serif` (Playfair Display) adoption on any heading — no component references `var(--serif)` or the `text-h1`/etc Tailwind aliases yet; that's part of the sweep.
- Reconciling Tailwind's built-in `text-sm`/`text-xs` (14px/12px) against D6's `--text-sm`/`--text-xs` (13.5px/12px) — noted in Task 1 Step 4, left as a sweep-plan decision.
- Radii, the landing page's `--landing-*` system — out of scope per spec D4.
