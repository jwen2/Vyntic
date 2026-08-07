# Demo Mode (ODD Walkthrough) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public `/demo` route that drops a visitor into a fully working Vyntic workspace backed entirely by fixture data, with a staged 16-cell ODD Screen run as the centerpiece.

**Architecture:** Frontend-only. A session-scoped flag diverts the app's three network chokepoints (`fetchWrapper`, `sseStream`, `subscribeRun`) to a fixture router in `src/demo/`. No backend changes, no new dependencies, no LLM calls at demo time. Fixture content for the ODD run is *recorded* from a real Gemini-backed run against the seeded Brightwater corpus, then frozen.

**Tech Stack:** React 18 + TypeScript, React Router, TanStack Query, Vite, Vitest (jsdom, `globals: false`).

**Spec:** `docs/superpowers/specs/2026-08-03-demo-mode-odd-design.md`

## Global Constraints

- **No new runtime dependencies.** Everything uses what is already in `frontend/package.json`.
- **No backend changes.** `backend/` is out of scope entirely, except for *running* it in Task 4 to record fixtures.
- **Vitest `globals: false`** — every test file must explicitly `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"`.
- **Path alias is `@/`** → `frontend/src/`. Use it in all imports.
- **Fixtures are typed against the real exported API interfaces** (`Deal`, `Manager`, `DocumentMetadata`, `Workflow`, `WorkflowRun`, `TabularCell`, `Citation`, `User`, `Position`). Never redeclare a local copy of these shapes — the whole drift-protection strategy depends on `tsc` failing when the real interface changes.
- **Never key-sniff cell payloads.** `answer_formatted` is a `kind`-tagged `CellShape` (`lib/cellShapes.ts`). Narrow on `kind`.
- **Static demo assets live under `/demo-assets/`, never `/demo/`** — `/demo` is a client route and nesting assets under it would depend on static serving beating the SPA fallback.
- **The fictional GP must be labelled as fictional** on any surface a visitor sees.
- Verification commands, run from `frontend/`:
  - `npx tsc --noEmit`
  - `npx vitest run`
  - `npm run build`
  - `npx eslint src`

---

### Task 1: Demo mode flag, transport interception, and the `/demo` gate

Deliverable: with the backend **stopped**, visiting `/demo` lands the visitor on `/app` as an authenticated demo user showing an empty fund list. Nothing 401s, nothing hangs.

**Files:**
- Create: `frontend/src/demo/mode.ts`
- Create: `frontend/src/demo/mode.test.ts`
- Create: `frontend/src/demo/transport.ts`
- Create: `frontend/src/demo/transport.test.ts`
- Create: `frontend/src/demo/fixtures/user.ts`
- Create: `frontend/src/pages/DemoGate.tsx`
- Modify: `frontend/src/lib/api.ts` (`getAuthToken` at :6-8, `fetchWrapper` at :62)
- Modify: `frontend/src/App.tsx` (add route)

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `isDemoMode(): boolean`
  - `enableDemoMode(): void`
  - `disableDemoMode(): void`
  - `DEMO_FLAG_KEY = "vyntic_demo_mode"`
  - `DEMO_TOKEN = "demo-session"`
  - `demoFetch(url: string, options: RequestInit): Promise<Response> | null` — returns `null` when no fixture matches, so the caller can decide how to fail
  - `registerDemoRoutes(routes: DemoRoute[]): void` and `type DemoRoute = { method: string; pattern: RegExp; handler: (m: RegExpMatchArray, body: unknown) => unknown }`
  - `DEMO_USER: User`

- [ ] **Step 1: Write the failing test for the mode flag**

Create `frontend/src/demo/mode.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { isDemoMode, enableDemoMode, disableDemoMode, DEMO_FLAG_KEY } from "./mode";

describe("demo mode flag", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("is off by default", () => {
    expect(isDemoMode()).toBe(false);
  });

  it("turns on and persists in sessionStorage", () => {
    enableDemoMode();
    expect(isDemoMode()).toBe(true);
    expect(sessionStorage.getItem(DEMO_FLAG_KEY)).toBe("1");
  });

  it("turns off again", () => {
    enableDemoMode();
    disableDemoMode();
    expect(isDemoMode()).toBe(false);
    expect(sessionStorage.getItem(DEMO_FLAG_KEY)).toBeNull();
  });

  it("clears any real auth token when enabled so a live session cannot blend in", () => {
    localStorage.setItem("vyntic_auth_token", "real-jwt");
    enableDemoMode();
    expect(localStorage.getItem("vyntic_auth_token")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/mode.test.ts`
Expected: FAIL — `Failed to resolve import "./mode"`.

- [ ] **Step 3: Implement the mode module**

Create `frontend/src/demo/mode.ts`:

```ts
/**
 * Demo mode is session-scoped: closing the tab ends it, but a refresh or
 * back-button navigation keeps it, so free-roam browsing works normally.
 *
 * The flag is read by the three network chokepoints (lib/api.ts fetchWrapper,
 * lib/sse.ts sseStream, lib/workflows.ts subscribeRun). When it is off, those
 * call sites take a single early-return check and behave exactly as before.
 */
export const DEMO_FLAG_KEY = "vyntic_demo_mode";

/**
 * Synthetic token handed to AuthProvider. It never reaches a server — the
 * transport is mocked — but it must be non-null, because AuthProvider bails
 * out before calling getMe() when getAuthToken() returns null.
 */
export const DEMO_TOKEN = "demo-session";

export function isDemoMode(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    // Private-mode Safari and similar can throw on storage access.
    return false;
  }
}

export function enableDemoMode(): void {
  // A real session must never blend with fixture data.
  localStorage.removeItem("vyntic_auth_token");
  sessionStorage.setItem(DEMO_FLAG_KEY, "1");
}

export function disableDemoMode(): void {
  sessionStorage.removeItem(DEMO_FLAG_KEY);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/mode.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write the failing test for the fixture router**

Create `frontend/src/demo/transport.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { demoFetch, registerDemoRoutes, resetDemoRoutes } from "./transport";

describe("demoFetch", () => {
  beforeEach(() => {
    resetDemoRoutes();
  });

  it("returns null when no route matches", async () => {
    expect(demoFetch("/api/nope", { method: "GET" })).toBeNull();
  });

  it("matches a registered GET route and returns a JSON Response", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things$/, handler: () => [{ id: "a" }] },
    ]);
    const res = await demoFetch("/api/things", { method: "GET" })!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "a" }]);
  });

  it("passes regex capture groups to the handler", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things\/([^/]+)$/, handler: (m) => ({ id: m[1] }) },
    ]);
    const res = await demoFetch("/api/things/xyz", { method: "GET" })!;
    expect(await res.json()).toEqual({ id: "xyz" });
  });

  it("parses a JSON request body and hands it to the handler", async () => {
    registerDemoRoutes([
      { method: "POST", pattern: /^\/api\/echo$/, handler: (_m, body) => body },
    ]);
    const res = await demoFetch("/api/echo", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    })!;
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("treats a missing method as GET", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things$/, handler: () => [] },
    ]);
    expect(demoFetch("/api/things", {})).not.toBeNull();
  });

  it("ignores the query string when matching", async () => {
    registerDemoRoutes([
      { method: "GET", pattern: /^\/api\/things$/, handler: () => [] },
    ]);
    expect(demoFetch("/api/things?page=2", { method: "GET" })).not.toBeNull();
  });

  it("returns a 204 with an empty body when the handler returns undefined", async () => {
    registerDemoRoutes([
      { method: "DELETE", pattern: /^\/api\/things\/x$/, handler: () => undefined },
    ]);
    const res = await demoFetch("/api/things/x", { method: "DELETE" })!;
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/transport.test.ts`
Expected: FAIL — `Failed to resolve import "./transport"`.

- [ ] **Step 7: Implement the fixture router**

Create `frontend/src/demo/transport.ts`:

```ts
/**
 * The demo fixture router. Maps (method, path) to a canned payload and
 * synthesises a Response, so `fetchWrapper` can hand it back to the app
 * without a network round trip.
 *
 * Returns null on no match rather than throwing or 404-ing, so the caller
 * chooses the failure mode. In dev an unmatched path is a loud console error
 * (see lib/api.ts) — silently returning empty data would let a half-mocked
 * surface look fine in review and break in front of a prospect.
 */
export interface DemoRoute {
  method: string;
  pattern: RegExp;
  handler: (match: RegExpMatchArray, body: unknown) => unknown;
}

let routes: DemoRoute[] = [];

export function registerDemoRoutes(next: DemoRoute[]): void {
  routes = routes.concat(next);
}

/** Test-only: drop all registered routes. */
export function resetDemoRoutes(): void {
  routes = [];
}

function jsonResponse(payload: unknown): Response {
  if (payload === undefined) {
    return new Response("", { status: 204 });
  }
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function demoFetch(url: string, options: RequestInit = {}): Promise<Response> | null {
  const method = (options.method || "GET").toUpperCase();
  const path = url.split("?")[0];

  for (const route of routes) {
    if (route.method.toUpperCase() !== method) continue;
    const match = path.match(route.pattern);
    if (!match) continue;

    let body: unknown = undefined;
    if (typeof options.body === "string") {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = options.body;
      }
    }
    return Promise.resolve(jsonResponse(route.handler(match, body)));
  }

  return null;
}
```

- [ ] **Step 8: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/transport.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 9: Add the demo user fixture and register the auth routes**

Create `frontend/src/demo/fixtures/user.ts`:

```ts
import type { User } from "@/lib/api";
import { registerDemoRoutes } from "@/demo/transport";
import { disableDemoMode } from "@/demo/mode";

export const DEMO_USER: User = {
  id: 1,
  email: "analyst@glenmoor.example",
  full_name: "Glenmoor Endowment (Demo)",
  is_admin: true,
};

export function registerUserFixtures(): void {
  registerDemoRoutes([
    { method: "GET", pattern: /^\/api\/auth\/me$/, handler: () => DEMO_USER },
    {
      method: "POST",
      pattern: /^\/api\/auth\/logout$/,
      // Logging out of the demo ends the demo; AuthContext then sends the
      // visitor to /login, which is a legitimate logged-out state.
      handler: () => {
        disableDemoMode();
        return undefined;
      },
    },
  ]);
}
```

- [ ] **Step 10: Create the fixture registration entry point**

Create `frontend/src/demo/index.ts`:

```ts
/**
 * Single registration entry point for every demo fixture group. Called once
 * by DemoGate before the app renders, and by tests that need the full set.
 *
 * Later tasks add their register*Fixtures() call here.
 */
import { registerUserFixtures } from "./fixtures/user";

let registered = false;

export function registerAllDemoFixtures(): void {
  if (registered) return;
  registered = true;
  registerUserFixtures();
}

export { isDemoMode, enableDemoMode, disableDemoMode, DEMO_TOKEN } from "./mode";
```

- [ ] **Step 11: Wire the interception into `lib/api.ts`**

In `frontend/src/lib/api.ts`, add the import at the top of the file (after the existing `import { sseStream } from "./sse";`):

```ts
import { isDemoMode, DEMO_TOKEN } from "@/demo/mode";
import { demoFetch } from "@/demo/transport";
```

Replace `getAuthToken` (currently lines 6-8):

```ts
export function getAuthToken(): string | null {
  // AuthProvider skips getMe() entirely when this returns null, so demo mode
  // needs a non-null sentinel. It never reaches a server.
  if (isDemoMode()) return DEMO_TOKEN;
  return localStorage.getItem(TOKEN_KEY);
}
```

Replace `fetchWrapper` (currently line 62):

```ts
async function fetchWrapper(url: string, options: RequestInit = {}): Promise<Response> {
  if (isDemoMode()) {
    const mocked = demoFetch(url, options);
    if (mocked) return mocked;
    if (import.meta.env.DEV) {
      console.error(
        `[demo] no fixture for ${options.method || "GET"} ${url} — this surface will break`
      );
    }
    return new Response(JSON.stringify({ detail: "Not available in demo" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    notifyUnauthorized();
  }

  return response;
}
```

Note the demo branch never calls `notifyUnauthorized()` — an unmatched fixture must not bounce the visitor to `/login`.

- [ ] **Step 12: Create the demo gate page**

Create `frontend/src/pages/DemoGate.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { enableDemoMode } from "@/demo/mode";
import { registerAllDemoFixtures } from "@/demo";

/**
 * `/demo` is an activation gate, not a page. It flips the demo flag, registers
 * fixtures, then redirects into the normal app routes.
 *
 * Redirecting into the real routes (rather than nesting the demo under
 * /demo/*) means every page component's hardcoded links — /deal/:id and the
 * rest — keep working with no changes. The cost is that the URL no longer
 * says "demo", which the persistent banner compensates for.
 */
export default function DemoGate() {
  const navigate = useNavigate();

  useEffect(() => {
    registerAllDemoFixtures();
    enableDemoMode();
    navigate("/app", { replace: true });
  }, [navigate]);

  return null;
}
```

- [ ] **Step 13: Register the route in `App.tsx`**

Add the lazy import beside the others (after the `LandingPage` import at line 10):

```tsx
const DemoGate = lazy(() => import("@/pages/DemoGate"));
```

Add the route immediately after the `/login` route (line 53), **outside** `ProtectedRoute`:

```tsx
<Route path="/demo" element={<DemoGate />} />
```

Also register fixtures at module scope in `main.tsx` so a **refresh** on `/app` while the flag is still set re-registers them. Add to `frontend/src/main.tsx`, before the render call:

```tsx
import { isDemoMode } from "@/demo/mode";
import { registerAllDemoFixtures } from "@/demo";

if (isDemoMode()) registerAllDemoFixtures();
```

- [ ] **Step 14: Verify**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint src`
Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/demo frontend/src/pages/DemoGate.tsx frontend/src/lib/api.ts frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat(demo): demo-mode flag, fixture transport, and the /demo gate"
```

---

### Task 2: Deal, manager, and document fixtures

Deliverable: with the backend stopped, `/app` lists both Brightwater funds; both fund workspaces open; the manager page shows the manager and its two funds; document lists populate.

**Files:**
- Create: `frontend/src/demo/fixtures/entities.ts`
- Create: `frontend/src/demo/fixtures/entities.test.ts`
- Modify: `frontend/src/demo/index.ts`

**Interfaces:**
- Consumes: `registerDemoRoutes`, `DemoRoute` from Task 1.
- Produces:
  - `DEMO_MANAGER_ID = "brightwater_capital"`
  - `DEMO_FUND_IV_ID = "brightwater_iv"`
  - `DEMO_FUND_III_ID = "brightwater_iii"`
  - `DEMO_DEALS: Deal[]`
  - `DEMO_MANAGER: Manager`
  - `DEMO_DOCUMENTS: Record<string, DocumentMetadata[]>` keyed by `deal_id`
  - `registerEntityFixtures(): void`

- [ ] **Step 1: Read the real interfaces you must satisfy**

Read these before writing fixtures — the fixtures must typecheck against them exactly:
- `Deal` — `frontend/src/lib/api.ts:421-433`
- `Manager`, `DocumentMetadata` — search `frontend/src/lib/api.ts` for `export interface Manager` and `export interface DocumentMetadata`

Source of truth for the *values* is `backend/app/seed.py:99-160` and `output/MANIFEST.md`.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/demo/fixtures/entities.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { resetDemoRoutes } from "@/demo/transport";
import { demoFetch } from "@/demo/transport";
import {
  registerEntityFixtures,
  DEMO_DEALS,
  DEMO_FUND_IV_ID,
  DEMO_MANAGER_ID,
} from "./entities";
import type { Deal } from "@/lib/api";

describe("entity fixtures", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerEntityFixtures();
  });

  it("lists both Brightwater funds", async () => {
    const res = await demoFetch("/api/deals", { method: "GET" })!;
    const deals = (await res.json()) as Deal[];
    expect(deals).toHaveLength(2);
    expect(deals.map((d) => d.deal_id).sort()).toEqual([
      "brightwater_iii",
      "brightwater_iv",
    ]);
  });

  it("serves every fund as entity_type fund under one manager", () => {
    for (const deal of DEMO_DEALS) {
      expect(deal.entity_type).toBe("fund");
      expect(deal.manager_id).toBe(DEMO_MANAGER_ID);
    }
  });

  it("resolves a single deal by id", async () => {
    const res = await demoFetch(`/api/deals/${DEMO_FUND_IV_ID}`, { method: "GET" })!;
    const deal = (await res.json()) as Deal;
    expect(deal.deal_id).toBe(DEMO_FUND_IV_ID);
    expect(deal.vintage).toBe(2026);
  });

  it("serves documents for each fund with unique filenames across the corpus", async () => {
    const seen = new Set<string>();
    for (const deal of DEMO_DEALS) {
      const res = await demoFetch(`/api/deals/${deal.deal_id}/documents`, {
        method: "GET",
      })!;
      const docs = (await res.json()) as { filename: string }[];
      expect(docs.length).toBeGreaterThan(0);
      for (const doc of docs) {
        // The static asset dir is flat and keyed by filename alone, so a
        // collision here would silently serve the wrong PDF.
        expect(seen.has(doc.filename)).toBe(false);
        seen.add(doc.filename);
      }
    }
  });

  it("serves the manager and its two funds", async () => {
    const mgr = await (await demoFetch(`/api/managers/${DEMO_MANAGER_ID}`, {
      method: "GET",
    })!).json();
    expect(mgr.manager_id).toBe(DEMO_MANAGER_ID);

    const funds = await (await demoFetch(`/api/managers/${DEMO_MANAGER_ID}/funds`, {
      method: "GET",
    })!).json();
    expect(funds).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/fixtures/entities.test.ts`
Expected: FAIL — `Failed to resolve import "./entities"`.

- [ ] **Step 4: Implement the entity fixtures**

Create `frontend/src/demo/fixtures/entities.ts`. Values mirror `backend/app/seed.py:99-160`; document metadata mirrors the `document_metadata` blocks there.

```ts
import type { Deal, Manager, DocumentMetadata } from "@/lib/api";
import { registerDemoRoutes } from "@/demo/transport";

export const DEMO_MANAGER_ID = "brightwater_capital";
export const DEMO_FUND_IV_ID = "brightwater_iv";
export const DEMO_FUND_III_ID = "brightwater_iii";

export const DEMO_MANAGER: Manager = {
  manager_id: DEMO_MANAGER_ID,
  name: "Brightwater Capital Partners, LLC",
  description:
    "Chicago-based North American industrials and business services manager, founded 2009, ~$2.1B AUM. Fictional demo GP.",
  tags: ["Buyout", "Industrials"],
  fund_count: 2,
};

export const DEMO_DEALS: Deal[] = [
  {
    deal_id: DEMO_FUND_IV_ID,
    name: "Brightwater Capital Partners IV",
    description:
      "2026 vintage, $1.25B target / $1.5B hard cap. Fund IV selection diligence.",
    document_count: 7,
    stage: "Diligence",
    tags: ["Industrials"],
    entity_type: "fund",
    manager_id: DEMO_MANAGER_ID,
    manager_name: DEMO_MANAGER.name,
    vintage: 2026,
    strategy: "Buyout",
  },
  {
    deal_id: DEMO_FUND_III_ID,
    name: "Brightwater Capital Partners III",
    description:
      "2021 vintage, $850M. Glenmoor holds a $25M commitment; active monitoring.",
    document_count: 6,
    stage: "Monitoring",
    tags: ["Industrials"],
    entity_type: "fund",
    manager_id: DEMO_MANAGER_ID,
    manager_name: DEMO_MANAGER.name,
    vintage: 2021,
    strategy: "Buyout",
  },
];

function doc(
  dealId: string,
  filename: string,
  category: string,
  scope: "entity" | "manager",
  pages: number,
  period?: string
): DocumentMetadata {
  return {
    doc_id: `demo_${filename.replace(/\W+/g, "_")}`,
    deal_id: dealId,
    filename,
    doc_category: category,
    scope,
    page_count: pages,
    period: period ?? null,
    uploaded_at: "2026-07-22T09:00:00Z",
    status: "ready",
  } as DocumentMetadata;
}

export const DEMO_DOCUMENTS: Record<string, DocumentMetadata[]> = {
  [DEMO_FUND_IV_ID]: [
    doc(DEMO_FUND_IV_ID, "brightwater_iv_lpa.pdf", "lpa", "entity", 18),
    doc(DEMO_FUND_IV_ID, "brightwater_iv_ddq.pdf", "ddq", "entity", 12),
    doc(DEMO_FUND_IV_ID, "brightwater_iv_ppm.pdf", "ppm", "entity", 16),
    doc(DEMO_FUND_IV_ID, "brightwater_iv_pitchbook.pdf", "pitchbook", "entity", 9),
    doc(DEMO_FUND_IV_ID, "brightwater_adv_part2a.pdf", "form_adv", "manager", 11),
    doc(DEMO_FUND_IV_ID, "brightwater_valuation_policy.pdf", "valuation_policy", "manager", 6),
    doc(DEMO_FUND_IV_ID, "brightwater_track_record.xlsx", "track_record", "manager", 1),
  ],
  [DEMO_FUND_III_ID]: [
    doc(DEMO_FUND_III_ID, "glenmoor_fund_iii_side_letter.pdf", "side_letter", "entity", 5),
    doc(DEMO_FUND_III_ID, "glenmoor_fund_iii_pcap_q2_2026.pdf", "capital_account", "entity", 3, "Q2 2026"),
    doc(DEMO_FUND_III_ID, "brightwater_iii_quarterly_q2_2026.pdf", "quarterly_report", "entity", 8, "Q2 2026"),
    doc(DEMO_FUND_III_ID, "brightwater_iii_audited_fs_2025.pdf", "financial_statements", "entity", 14, "FY2025"),
    doc(DEMO_FUND_III_ID, "brightwater_iii_capital_call_07.pdf", "capital_call", "entity", 2, "Q3 2026"),
    doc(DEMO_FUND_III_ID, "brightwater_iii_distribution_03.pdf", "distribution_notice", "entity", 2, "Q3 2026"),
  ],
};

/** Flat filename → DocumentMetadata index, used by the static asset helper. */
export const DEMO_DOCS_BY_FILENAME: Record<string, DocumentMetadata> = Object.fromEntries(
  Object.values(DEMO_DOCUMENTS)
    .flat()
    .map((d) => [d.filename, d])
);

export function registerEntityFixtures(): void {
  registerDemoRoutes([
    { method: "GET", pattern: /^\/api\/deals$/, handler: () => DEMO_DEALS },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)$/,
      handler: (m) => DEMO_DEALS.find((d) => d.deal_id === m[1]) ?? DEMO_DEALS[0],
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/documents$/,
      handler: (m) => DEMO_DOCUMENTS[m[1]] ?? [],
    },
    { method: "GET", pattern: /^\/api\/managers$/, handler: () => [DEMO_MANAGER] },
    {
      method: "GET",
      pattern: /^\/api\/managers\/([^/]+)$/,
      handler: () => DEMO_MANAGER,
    },
    {
      method: "GET",
      pattern: /^\/api\/managers\/([^/]+)\/funds$/,
      handler: () => DEMO_DEALS,
    },
    {
      method: "GET",
      pattern: /^\/api\/managers\/([^/]+)\/documents$/,
      handler: () =>
        DEMO_DOCUMENTS[DEMO_FUND_IV_ID].filter((d) => d.scope === "manager"),
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/metadata\/stages$/,
      handler: () => ["Screening", "Diligence", "IC Review", "Committed", "Monitoring"],
    },
    { method: "GET", pattern: /^\/api\/deals\/metadata\/tags$/, handler: () => ["Industrials"] },
  ]);
}
```

**Note on `page_count` values:** these are placeholders written from the corpus's rough shape. In Task 4 you will have the recorded run's real citations, which reference real page numbers. Cross-check then and correct any `page_count` that is lower than a cited page.

**Note on the `as DocumentMetadata` cast in `doc()`:** remove it if the real `DocumentMetadata` interface accepts this object literal directly. It is present only because the interface may carry fields not enumerated here. If `tsc` passes without the cast, drop it — an unnecessary cast defeats the drift protection.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/fixtures/entities.test.ts`
Expected: PASS — 5 tests. If `tsc` complains about missing `Manager` or `DocumentMetadata` fields, add them with values consistent with `seed.py`.

- [ ] **Step 6: Register in the entry point**

In `frontend/src/demo/index.ts`, add the import and the call inside `registerAllDemoFixtures`:

```ts
import { registerEntityFixtures } from "./fixtures/entities";
// ...
  registerUserFixtures();
  registerEntityFixtures();
```

- [ ] **Step 7: Verify manually with the backend stopped**

Stop the backend (`docker compose stop backend`), start the dev frontend, visit `/demo`.
Expected: `/app` lists both funds; clicking either opens its workspace; `/manager/brightwater_capital` renders. Check the browser console for `[demo] no fixture for …` errors and note which paths are still missing — later tasks cover them.

- [ ] **Step 8: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint src`

```bash
git add frontend/src/demo
git commit -m "feat(demo): Brightwater deal, manager, and document fixtures"
```

---

### Task 3: Static document assets and the viewer URL helper

Deliverable: with the backend stopped, opening any document in the demo renders the genuine PDF at the genuine page.

**Files:**
- Create: `frontend/public/demo-assets/docs/` (13 copied files)
- Create: `frontend/src/demo/docUrl.ts`
- Create: `frontend/src/demo/docUrl.test.ts`
- Modify: `frontend/src/components/DocumentViewer.tsx:52-56`

**Interfaces:**
- Consumes: `isDemoMode` (Task 1).
- Produces: `buildDocumentViewUrl(dealId: string, filename: string, viewToken: string | null, isExcel: boolean, page: number): string`

- [ ] **Step 1: Copy the corpus into the public assets dir**

```bash
cd D:/projects/Vyntic
mkdir -p frontend/public/demo-assets/docs
cp output/*.pdf output/*.xlsx frontend/public/demo-assets/docs/
ls -1 frontend/public/demo-assets/docs | wc -l
```

Expected: `13`. Total size ~328 KB.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/demo/docUrl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enableDemoMode, disableDemoMode } from "./mode";
import { buildDocumentViewUrl } from "./docUrl";

describe("buildDocumentViewUrl", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    disableDemoMode();
  });

  it("builds the authenticated API url outside demo mode", () => {
    expect(buildDocumentViewUrl("d1", "a.pdf", "tok", false, 3)).toBe(
      "/api/deals/d1/documents/a.pdf/view?token=tok"
    );
  });

  it("omits the token param when there is no token", () => {
    expect(buildDocumentViewUrl("d1", "a.pdf", null, false, 1)).toBe(
      "/api/deals/d1/documents/a.pdf/view"
    );
  });

  it("adds the sheet param for Excel outside demo mode", () => {
    expect(buildDocumentViewUrl("d1", "a.xlsx", "tok", true, 2)).toBe(
      "/api/deals/d1/documents/a.xlsx/view?token=tok&sheet=1"
    );
  });

  it("returns the flat static asset path in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_iv_ddq.pdf", null, false, 4)).toBe(
      "/demo-assets/docs/brightwater_iv_ddq.pdf"
    );
  });

  it("keeps the sheet param for Excel in demo mode", () => {
    enableDemoMode();
    expect(buildDocumentViewUrl("brightwater_iv", "brightwater_track_record.xlsx", null, true, 2)).toBe(
      "/demo-assets/docs/brightwater_track_record.xlsx?sheet=1"
    );
  });

  it("never nests demo assets under the /demo client route", () => {
    enableDemoMode();
    const url = buildDocumentViewUrl("d", "a.pdf", null, false, 1);
    expect(url.startsWith("/demo/")).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/docUrl.test.ts`
Expected: FAIL — `Failed to resolve import "./docUrl"`.

- [ ] **Step 4: Implement the helper**

Create `frontend/src/demo/docUrl.ts`:

```ts
import { isDemoMode } from "./mode";

/**
 * Builds the URL DocumentViewer loads into its <iframe>.
 *
 * Iframes bypass fetch, so the demo transport cannot intercept this the way
 * it intercepts every other call. This helper is the one place demo mode has
 * to reach into a component's URL construction.
 *
 * The demo path is flat and keyed by filename alone — corpus filenames are
 * unique, asserted in entities.test.ts. The prefix is /demo-assets/, never
 * /demo/, because /demo is a client route.
 */
export function buildDocumentViewUrl(
  dealId: string,
  filename: string,
  viewToken: string | null,
  isExcel: boolean,
  page: number
): string {
  const params = new URLSearchParams();

  if (isDemoMode()) {
    if (isExcel && page > 0) params.set("sheet", String(Math.max(0, page - 1)));
    const query = params.toString();
    return `/demo-assets/docs/${encodeURIComponent(filename)}${query ? `?${query}` : ""}`;
  }

  if (viewToken) params.set("token", viewToken);
  if (isExcel && page > 0) params.set("sheet", String(Math.max(0, page - 1)));
  const query = params.toString();
  return `/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(filename)}/view${query ? `?${query}` : ""}`;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/docUrl.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Use the helper in `DocumentViewer.tsx`**

Add the import at the top of `frontend/src/components/DocumentViewer.tsx`:

```tsx
import { buildDocumentViewUrl } from "@/demo/docUrl";
```

Replace lines 52-56 (the `params` / `query` / `viewUrl` block) with:

```tsx
const viewUrl = buildDocumentViewUrl(dealId, filename, viewToken, isExcel, page);
```

Leave the `#page=` fragment at line 160 alone — it still applies.

- [ ] **Step 7: Add the view-token fixture**

The viewer calls `getDocumentViewToken` before rendering and shows a spinner until it resolves (`DocumentViewer.tsx:36-50, 151`). Demo mode must answer it. Add to `registerEntityFixtures()` in `frontend/src/demo/fixtures/entities.ts`:

```ts
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/documents\/([^/]+)\/view-token$/,
      // The value is ignored — buildDocumentViewUrl drops it in demo mode —
      // but it must resolve, or the viewer never leaves its loading state.
      handler: () => ({ token: "demo-view-token" }),
    },
```

Confirm the real response shape by reading `getDocumentViewToken` in `frontend/src/lib/api.ts`; if it returns a bare string rather than `{ token }`, match that instead.

- [ ] **Step 8: Verify manually**

With the backend stopped, open a fund workspace → Documents → click `brightwater_iv_ddq.pdf`.
Expected: the real PDF renders in the iframe. Try an Excel file too.

- [ ] **Step 9: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build`

```bash
git add frontend/public/demo-assets frontend/src/demo frontend/src/components/DocumentViewer.tsx
git commit -m "feat(demo): serve the corpus as static assets and route the viewer to them"
```

---

### Task 4: Record a real ODD Screen run

Deliverable: `frontend/src/demo/fixtures/recorded-odd-run.json` — a real, Gemini-backed 16-cell run snapshot. No frontend behavior changes in this task.

**Files:**
- Create: `scripts/record_demo_run.mjs`
- Create: `frontend/src/demo/fixtures/recorded-odd-run.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a JSON file whose top-level shape is the `WorkflowRun` interface (`frontend/src/lib/workflows.ts:255-270`) with a populated `cells: TabularCell[]`.

- [ ] **Step 1: Bring the stack up and confirm the corpus is seeded**

```bash
cd D:/projects/Vyntic
docker compose up --build -d
```

Wait for seeding to finish (it ingests 13 files with CPU-throttled batching — watch `docker compose logs -f backend`). Confirm both funds exist and Fund IV has 7 documents before continuing. `GEMINI_API_KEY` is already present in `backend/.env`.

- [ ] **Step 2: Write the recording script**

Create `scripts/record_demo_run.mjs`:

```js
/**
 * Records a real ODD Screen run against the seeded Brightwater Fund IV corpus
 * and writes the completed run to the demo fixtures directory.
 *
 * Polls GET /runs/{id} rather than subscribing to SSE — simpler and just as
 * accurate, since we only want the terminal state.
 *
 * Usage:
 *   node scripts/record_demo_run.mjs <admin-email> <admin-password>
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.VYNTIC_API || "http://localhost:8000";
const [email, password] = process.argv.slice(2);
const DEAL_ID = "brightwater_iv";

const ROWS = [
  "Management company — Brightwater Capital Partners, LLC",
  "Fund vehicle — Brightwater Capital Partners IV, L.P.",
];

if (!email || !password) {
  console.error("usage: node scripts/record_demo_run.mjs <email> <password>");
  process.exit(1);
}

async function api(path, init = {}, token) {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

const { access_token: token } = await api("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});

const workflows = await api(`/deals/${DEAL_ID}/workflows`, {}, token);
const odd = workflows.find((w) => w.name === "ODD Screen");
if (!odd) throw new Error("ODD Screen template not found — is workflow_seed_lp reconciled?");
console.log(`ODD Screen: ${odd.id} (${odd.columns.length} columns)`);

const docs = await api(`/deals/${DEAL_ID}/documents`, {}, token);
console.log(`documents in context: ${docs.length}`);

let run = await api(
  `/deals/${DEAL_ID}/workflows/${odd.id}/runs`,
  {
    method: "POST",
    body: JSON.stringify({
      document_ids: docs.map((d) => d.doc_id),
      synthesis_questions: ROWS,
    }),
  },
  token
);
console.log(`run started: ${run.id}`);

const expected = ROWS.length * odd.columns.length;
while (run.status === "running" || run.status === "pending") {
  await new Promise((r) => setTimeout(r, 5000));
  run = await api(`/runs/${run.id}`, {}, token);
  const done = run.cells.filter((c) => c.status === "complete" || c.status === "error").length;
  console.log(`  ${run.status}: ${done}/${expected} cells`);
}

const errored = run.cells.filter((c) => c.status === "error");
if (errored.length) {
  console.warn(`WARNING: ${errored.length} cells errored — retry them in the UI before recording`);
}

const out = "frontend/src/demo/fixtures/recorded-odd-run.json";
writeFileSync(out, JSON.stringify(run, null, 2));
console.log(`wrote ${out} — ${run.cells.length} cells, status ${run.status}`);
```

- [ ] **Step 3: Run the recording**

```bash
cd D:/projects/Vyntic
node scripts/record_demo_run.mjs admin@example.com "$DEFAULT_ADMIN_PASSWORD"
```

Substitute the real admin email and the `DEFAULT_ADMIN_PASSWORD` value from `backend/.env`.
Expected: 16 cells, status `complete`. If any cell errored, retry it in the UI and re-run the script.

- [ ] **Step 4: Review the recorded content against the manifest — this is the gate**

Open the JSON and check each finding from `output/MANIFEST.md` actually landed. The demo's whole credibility rests on this:

| Must appear | In row | In column |
|---|---|---|
| Daniel Roache departed 2026-02-28 while still listed as active / named Key Person | Management company | GP financial health |
| Brightwater Securities, LLC affiliated broker-dealer, omitted from the DDQ | Management company | Conflicts of interest |
| 2023 SEC deficiency letter on expense allocation | Management company | Regulatory & litigation |
| DDQ claims 100% fee offset vs LPA's 50% | Either | Compliance program |
| Level 3 GP-marked, third-party review only annually | Fund vehicle | Valuation governance |
| No SOC 2, no fixed pen-test cadence | Fund vehicle | Cybersecurity & BCP |
| `Red flag` | Management company | Overall ODD rating |
| `Monitor` | Fund vehicle | Overall ODD rating |

If a finding is missing, re-run — the extraction is non-deterministic. Do **not** paper over a gap by hand-writing a finding the model did not produce; that would put a claim in the demo that its own citations do not support.

- [ ] **Step 5: Hand-edit for tone and verify citations**

Tighten wording where the model was verbose. For every citation you keep, confirm `source_file` is one of the 13 corpus filenames and `page` is within that document's real page count — a citation pointing past the end of the PDF is the one bug a prospect will find. Correct any `page_count` in `entities.ts` that a real citation exceeds.

- [ ] **Step 6: Commit**

```bash
git add scripts/record_demo_run.mjs frontend/src/demo/fixtures/recorded-odd-run.json
git commit -m "feat(demo): record a real ODD Screen run against the Brightwater corpus"
```

---

### Task 5: Workflow and completed-run fixtures

Deliverable: with the backend stopped, the Workflows tab lists the ODD Screen and the recorded run is browsable — 16 cells with working citation drill-down.

**Files:**
- Create: `frontend/src/demo/fixtures/workflows.ts`
- Create: `frontend/src/demo/fixtures/workflows.test.ts`
- Modify: `frontend/src/demo/index.ts`

**Interfaces:**
- Consumes: `recorded-odd-run.json` (Task 4), `DEMO_FUND_IV_ID`, `DEMO_DOCS_BY_FILENAME` (Task 2).
- Produces:
  - `DEMO_ODD_WORKFLOW: Workflow`
  - `DEMO_ODD_RUN: WorkflowRun`
  - `DEMO_ODD_ROWS: string[]`
  - `registerWorkflowFixtures(): void`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/demo/fixtures/workflows.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "@/demo/transport";
import { registerWorkflowFixtures, DEMO_ODD_RUN, DEMO_ODD_WORKFLOW, DEMO_ODD_ROWS } from "./workflows";
import { DEMO_DOCS_BY_FILENAME } from "./entities";
import { asShape } from "@/lib/cellShapes";

describe("workflow fixtures", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerWorkflowFixtures();
  });

  it("exposes the ODD Screen with 8 columns", () => {
    expect(DEMO_ODD_WORKFLOW.name).toBe("ODD Screen");
    expect(DEMO_ODD_WORKFLOW.columns).toHaveLength(8);
    expect(DEMO_ODD_WORKFLOW.row_source).toBe("multi_doc_synthesis");
  });

  it("records exactly 2 rows x 8 columns = 16 cells", () => {
    expect(DEMO_ODD_ROWS).toHaveLength(2);
    expect(DEMO_ODD_RUN.cells).toHaveLength(16);
  });

  it("has every cell complete with no errors", () => {
    for (const cell of DEMO_ODD_RUN.cells) {
      expect(cell.status).toBe("complete");
      expect(cell.error_message).toBeNull();
    }
  });

  it("cites only real corpus files at pages inside those files", () => {
    for (const cell of DEMO_ODD_RUN.cells) {
      for (const cite of cell.citations) {
        if (!cite) continue;
        const doc = DEMO_DOCS_BY_FILENAME[cite.source_file];
        expect(doc, `unknown source_file ${cite.source_file}`).toBeDefined();
        expect(cite.page).toBeGreaterThan(0);
        expect(cite.page).toBeLessThanOrEqual(doc.page_count);
      }
    }
  });

  it("lands Red flag on the management company row", () => {
    const ratingColumn = DEMO_ODD_WORKFLOW.columns.find(
      (c) => c.label === "Overall ODD rating"
    )!;
    const cell = DEMO_ODD_RUN.cells.find(
      (c) => c.column_id === ratingColumn.id && c.row_key === DEMO_ODD_ROWS[0]
    )!;
    const shape = asShape(cell.answer_formatted);
    expect(shape?.kind).toBe("enum");
    if (shape?.kind === "enum") expect(shape.value).toBe("Red flag");
  });

  it("serves the workflow list and the run over the fixture transport", async () => {
    const list = await (await demoFetch("/api/deals/brightwater_iv/workflows", {
      method: "GET",
    })!).json();
    expect(list.some((w: { name: string }) => w.name === "ODD Screen")).toBe(true);

    const run = await (await demoFetch(`/api/runs/${DEMO_ODD_RUN.id}`, {
      method: "GET",
    })!).json();
    expect(run.cells).toHaveLength(16);
  });
});
```

Confirm `asShape` is exported from `@/lib/cellShapes` before relying on it; if the export is named differently, use the real name.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts`
Expected: FAIL — `Failed to resolve import "./workflows"`.

- [ ] **Step 3: Implement the workflow fixtures**

Create `frontend/src/demo/fixtures/workflows.ts`:

```ts
import type { Workflow, WorkflowRun } from "@/lib/workflows";
import { registerDemoRoutes } from "@/demo/transport";
import { DEMO_FUND_IV_ID, DEMO_FUND_III_ID } from "./entities";
import recorded from "./recorded-odd-run.json";

/**
 * The ODD Screen run recorded against the real Brightwater corpus with a real
 * model (scripts/record_demo_run.mjs). Frozen here so the demo needs no LLM,
 * no key, and no backend at runtime — but reads as genuine, because it is.
 */
export const DEMO_ODD_RUN = recorded as unknown as WorkflowRun;

export const DEMO_ODD_ROWS: string[] = [
  "Management company — Brightwater Capital Partners, LLC",
  "Fund vehicle — Brightwater Capital Partners IV, L.P.",
];

/**
 * Mirrors the ODD Screen built-in from workflow_seed_lp.py:96. Column ids come
 * from the recorded run so cell.column_id always resolves — the ids are DB
 * generated, so they cannot be hardcoded independently.
 */
export const DEMO_ODD_WORKFLOW: Workflow = recordedWorkflow();

function recordedWorkflow(): Workflow {
  // The recording script captured the run; the workflow it ran against is
  // reconstructed from the same source constants plus the run's column ids.
  const labels = [
    { label: "Valuation governance", format: "markdown" },
    { label: "Service providers", format: "kv" },
    { label: "Regulatory & litigation history", format: "markdown" },
    { label: "Cybersecurity & BCP", format: "markdown" },
    { label: "Compliance program", format: "markdown" },
    { label: "Conflicts of interest", format: "markdown" },
    { label: "Financial health of the GP", format: "markdown" },
    { label: "Overall ODD rating", format: "enum" },
  ] as const;

  // Preserve first-seen column order from the recorded cells.
  const orderedIds: string[] = [];
  for (const cell of DEMO_ODD_RUN.cells) {
    if (!orderedIds.includes(cell.column_id)) orderedIds.push(cell.column_id);
  }

  return {
    id: DEMO_ODD_RUN.workflow_id,
    deal_id: null,
    entity_type: "fund",
    name: "ODD Screen",
    description:
      "Operational due diligence across governance, providers, compliance, and GP health",
    type: "tabular",
    row_source: "multi_doc_synthesis",
    output_format: "excel",
    is_builtin: true,
    cloned_from: null,
    created_by: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    stages: [],
    variables: [],
    columns: orderedIds.map((id, i) => ({
      id,
      order_index: i + 1,
      label: labels[i].label,
      prompt: "",
      format: labels[i].format,
      tags: labels[i].label === "Overall ODD rating" ? ["Clean", "Monitor", "Red flag"] : null,
      is_derived: false,
      formula: null,
    })) as Workflow["columns"],
  };
}

export function registerWorkflowFixtures(): void {
  registerDemoRoutes([
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows$/,
      handler: () => [DEMO_ODD_WORKFLOW],
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)$/,
      handler: () => DEMO_ODD_WORKFLOW,
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)\/runs$/,
      // Fund IV shows the recorded run as run history; Fund III has none.
      handler: (m) => (m[1] === DEMO_FUND_IV_ID ? [DEMO_ODD_RUN] : []),
    },
    {
      method: "GET",
      pattern: /^\/api\/runs\/([^/]+)$/,
      handler: () => DEMO_ODD_RUN,
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/runs$/,
      handler: (m) => (m[1] === DEMO_FUND_III_ID ? [] : [DEMO_ODD_RUN]),
    },
  ]);
}
```

**If the column order assumption fails** (recorded cells not emitted in column order), sort `orderedIds` explicitly against the label list by matching each column id to a cell whose `answer_display` you can attribute. Verify the mapping visually in Step 5 — a mislabelled column is the kind of error tests will not catch.

- [ ] **Step 4: Enable JSON module imports if needed**

If `tsc` errors on the JSON import, add `"resolveJsonModule": true` to `compilerOptions` in `frontend/tsconfig.json`.

- [ ] **Step 5: Run the tests and verify column labels visually**

Run: `cd frontend && npx vitest run src/demo/fixtures/workflows.test.ts`
Expected: PASS — 6 tests.

Then register in `frontend/src/demo/index.ts` (`registerWorkflowFixtures()`), start the frontend with the backend stopped, and open Fund IV → Workflows → the recorded run.
Expected: 2 rows × 8 columns, every column header matching its content, citations opening the right PDF page.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/demo frontend/tsconfig.json
git commit -m "feat(demo): ODD Screen workflow and recorded-run fixtures"
```

---

### Task 6: Live run replay — the centerpiece

Deliverable: clicking **Run** on the ODD Screen streams 16 cells into the grid over ~20-30 seconds, ending on `Red flag` / `Monitor`. Backend stopped.

**Files:**
- Create: `frontend/src/demo/runReplay.ts`
- Create: `frontend/src/demo/runReplay.test.ts`
- Modify: `frontend/src/lib/workflows.ts` (`subscribeRun` at :393)
- Modify: `frontend/src/demo/fixtures/workflows.ts` (add the run-start route)

**Interfaces:**
- Consumes: `DEMO_ODD_RUN`, `DEMO_ODD_WORKFLOW` (Task 5); `RunStreamEvent`, `WorkflowRun`, `TabularCell` from `@/lib/workflows`.
- Produces: `replayDemoRun(onEvent: (e: RunStreamEvent) => void): () => void`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/demo/runReplay.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { replayDemoRun } from "./runReplay";
import type { RunStreamEvent } from "@/lib/workflows";

describe("replayDemoRun", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens with a snapshot whose cells are all pending", () => {
    const events: RunStreamEvent[] = [];
    replayDemoRun((e) => events.push(e));
    vi.advanceTimersByTime(10);

    expect(events[0].type).toBe("snapshot");
    if (events[0].type === "snapshot") {
      expect(events[0].run.status).toBe("running");
      expect(events[0].run.cells).toHaveLength(16);
      expect(events[0].run.cells.every((c) => c.status === "pending")).toBe(true);
    }
  });

  it("emits all 16 cells and a terminal run event", () => {
    const events: RunStreamEvent[] = [];
    replayDemoRun((e) => events.push(e));
    vi.advanceTimersByTime(120_000);

    const cells = events.filter((e) => e.type === "cell");
    expect(cells).toHaveLength(16);

    const last = events[events.length - 1];
    expect(last.type).toBe("run");
    if (last.type === "run") expect(last.status).toBe("complete");
  });

  it("emits cells column-major, matching real dispatch ordering", () => {
    const events: RunStreamEvent[] = [];
    replayDemoRun((e) => events.push(e));
    vi.advanceTimersByTime(120_000);

    const columnOrder: string[] = [];
    for (const e of events) {
      if (e.type !== "cell") continue;
      if (columnOrder[columnOrder.length - 1] !== e.cell.column_id) {
        columnOrder.push(e.cell.column_id);
      }
    }
    // Column-major means each column id appears as one contiguous block.
    expect(new Set(columnOrder).size).toBe(columnOrder.length);
  });

  it("stops emitting after the returned cleanup runs", () => {
    const events: RunStreamEvent[] = [];
    const stop = replayDemoRun((e) => events.push(e));
    vi.advanceTimersByTime(10);
    const afterSnapshot = events.length;
    stop();
    vi.advanceTimersByTime(120_000);
    expect(events.length).toBe(afterSnapshot);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/runReplay.test.ts`
Expected: FAIL — `Failed to resolve import "./runReplay"`.

- [ ] **Step 3: Implement the replay engine**

Create `frontend/src/demo/runReplay.ts`:

```ts
import type { RunStreamEvent, TabularCell, WorkflowRun } from "@/lib/workflows";
import { DEMO_ODD_RUN, DEMO_ODD_WORKFLOW } from "./fixtures/workflows";

/** Jittered per-cell delay, in ms. 16 cells lands around 20-30 seconds. */
const MIN_DELAY = 250;
const MAX_DELAY = 600;

/**
 * Replays the recorded ODD run as a live-looking stream.
 *
 * Cells are emitted column-major because that is how the real executor
 * dispatches them — a row-major replay would look subtly wrong to anyone
 * who has watched a real run.
 *
 * Returns a cleanup function with the same contract as subscribeRun.
 */
export function replayDemoRun(onEvent: (event: RunStreamEvent) => void): () => void {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const columnOrder = DEMO_ODD_WORKFLOW.columns.map((c) => c.id);
  const ordered: TabularCell[] = [];
  for (const columnId of columnOrder) {
    for (const cell of DEMO_ODD_RUN.cells) {
      if (cell.column_id === columnId) ordered.push(cell);
    }
  }

  const pendingRun: WorkflowRun = {
    ...DEMO_ODD_RUN,
    status: "running",
    completed_at: null,
    cells: DEMO_ODD_RUN.cells.map((c) => ({
      ...c,
      status: "pending",
      answer: "",
      answer_display: "",
      answer_formatted: null,
      citations: [],
      started_at: null,
      completed_at: null,
    })),
  };

  const schedule = (fn: () => void, at: number) => {
    timers.push(
      setTimeout(() => {
        if (!cancelled) fn();
      }, at)
    );
  };

  schedule(() => onEvent({ type: "snapshot", run: pendingRun }), 0);

  let clock = 300;
  for (const cell of ordered) {
    clock += MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
    const at = clock;
    schedule(() => onEvent({ type: "cell", cell }), at);
  }

  clock += 400;
  schedule(
    () => onEvent({ type: "run", run_id: DEMO_ODD_RUN.id, status: "complete" }),
    clock
  );

  return () => {
    cancelled = true;
    for (const t of timers) clearTimeout(t);
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/runReplay.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Intercept `subscribeRun`**

In `frontend/src/lib/workflows.ts`, add near the existing imports:

```ts
import { isDemoMode } from "@/demo/mode";
```

Then insert at the very top of the `subscribeRun` function body (before `let source: EventSource | null = null;` at :398):

```ts
  if (isDemoMode()) {
    // Dynamic import keeps the replay engine and the recorded-run JSON out of
    // the main bundle for everyone who never opens the demo.
    let stop: (() => void) | null = null;
    let cancelled = false;
    void import("@/demo/runReplay").then(({ replayDemoRun }) => {
      if (cancelled) return;
      stop = replayDemoRun(onEvent);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }
```

- [ ] **Step 6: Add the run-start route**

`startWorkflowRun` POSTs and expects a `WorkflowRun` back before the UI subscribes. Add to `registerWorkflowFixtures()` in `frontend/src/demo/fixtures/workflows.ts`:

```ts
    {
      method: "POST",
      pattern: /^\/api\/deals\/([^/]+)\/workflows\/([^/]+)\/runs$/,
      // Returns the recorded run in a running state; replayDemoRun then
      // streams its cells in. The UI subscribes on this id.
      handler: () => ({
        ...DEMO_ODD_RUN,
        status: "running",
        completed_at: null,
        cells: [],
      }),
    },
    {
      method: "POST",
      pattern: /^\/api\/runs\/([^/]+)\/stream-token$/,
      handler: () => ({ token: "demo-stream-token" }),
    },
    {
      method: "GET",
      pattern: /^\/api\/runs\/([^/]+)\/stream-token$/,
      handler: () => ({ token: "demo-stream-token" }),
    },
```

Both methods are registered because `subscribeRun` mints the token via `request(...)` with a default GET; keeping both costs nothing and avoids a mismatch.

- [ ] **Step 7: Verify the centerpiece manually — this is the demo**

With the backend stopped: `/demo` → Fund IV → Workflows → ODD Screen → Run.

Expected:
- The grid renders 2 rows × 8 columns immediately, all cells pending
- Cells fill column by column over roughly 20-30 seconds
- The final column lands `Red flag` (management company) and `Monitor` (fund vehicle)
- Clicking any cell opens the detail panel with citations
- Clicking a citation opens the real PDF at the cited page

- [ ] **Step 8: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build && npx eslint src`

```bash
git add frontend/src/demo frontend/src/lib/workflows.ts
git commit -m "feat(demo): replay the recorded ODD run as a live stream"
```

---

### Task 7: Chat with suggested questions and an honest fallback

Deliverable: chat in the demo answers a fixed set of cited questions from chips, and tells the truth when asked anything else.

**Files:**
- Create: `frontend/src/demo/fixtures/chat.ts`
- Create: `frontend/src/demo/fixtures/chat.test.ts`
- Modify: `frontend/src/lib/sse.ts` (`sseStream`)
- Modify: `frontend/src/demo/index.ts`

**Interfaces:**
- Consumes: `isDemoMode` (Task 1); `SseHandlers` from `@/lib/sse`.
- Produces:
  - `DEMO_QUESTIONS: { question: string; answer: string; citations: Citation[] }[]`
  - `demoSseStream(url: string, body: unknown, handlers: SseHandlers<unknown>): AbortController`
  - `matchDemoQuestion(text: string): DemoAnswer | null`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/demo/fixtures/chat.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchDemoQuestion, DEMO_QUESTIONS, OFF_SCRIPT_ANSWER } from "./chat";

describe("demo chat matching", () => {
  it("matches a canned question verbatim", () => {
    const q = DEMO_QUESTIONS[0].question;
    expect(matchDemoQuestion(q)?.answer).toBe(DEMO_QUESTIONS[0].answer);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const q = DEMO_QUESTIONS[0].question;
    expect(matchDemoQuestion(`  ${q.toUpperCase()}  `)).not.toBeNull();
  });

  it("matches on distinctive keywords, not just exact text", () => {
    expect(matchDemoQuestion("what about roache")).not.toBeNull();
  });

  it("returns null for off-script input", () => {
    expect(matchDemoQuestion("what is the weather in Chicago")).toBeNull();
  });

  it("covers the key ODD findings", () => {
    const all = DEMO_QUESTIONS.map((q) => q.question.toLowerCase()).join(" ");
    expect(all).toContain("roache");
    expect(all).toContain("conflict");
    expect(all).toContain("valuation");
  });

  it("never fabricates an answer off-script", () => {
    expect(OFF_SCRIPT_ANSWER).toContain("fixed set of questions");
  });

  it("cites only real corpus filenames", () => {
    for (const q of DEMO_QUESTIONS) {
      for (const c of q.citations) {
        expect(c.source_file).toMatch(/^(brightwater|glenmoor)_.*\.(pdf|xlsx)$/);
        expect(c.page).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`
Expected: FAIL — `Failed to resolve import "./chat"`.

- [ ] **Step 3: Implement the chat fixtures**

Create `frontend/src/demo/fixtures/chat.ts`. Draw the answer text and citations from the recorded run's cells where they overlap, so chat and the grid never contradict each other.

```ts
import type { Citation } from "@/lib/api";

export interface DemoAnswer {
  question: string;
  /** Distinctive lowercase tokens; any one of them matching selects this answer. */
  keywords: string[];
  answer: string;
  citations: Citation[];
}

/**
 * Free-text questions cannot be convincingly mocked, so the demo answers a
 * fixed set surfaced as suggested chips. Anything else gets OFF_SCRIPT_ANSWER
 * rather than a fabricated response — inventing an answer here would break
 * the product's core promise in the one place a prospect is watching.
 */
export const OFF_SCRIPT_ANSWER =
  "This demo answers a fixed set of questions. In the live product this runs against your documents.";

export const DEMO_QUESTIONS: DemoAnswer[] = [
  {
    question: "Has any senior investment professional left the firm?",
    keywords: ["roache", "departed", "left the firm", "key person", "succession"],
    answer:
      "Yes — and it is not disclosed in the DDQ.\n\nForm ADV Part 2A states that **Daniel Roache ceased to be an advisory employee effective February 28, 2026**. He is nonetheless still listed as active senior team in both the Fund IV PPM and the pitchbook, and he is a named **Key Person** in the Fund IV LPA. The DDQ's team and succession answer does not mention the departure.\n\nThis is a Key Person provision exposure that the marketing materials do not reflect.",
    citations: [
      { source_file: "brightwater_adv_part2a.pdf", page: 4, text_snippet: "Daniel Roache ceased to be an advisory employee effective February 28, 2026." },
      { source_file: "brightwater_iv_ppm.pdf", page: 6, text_snippet: "Senior investment team: … Daniel Roache …" },
      { source_file: "brightwater_iv_lpa.pdf", page: 11, text_snippet: "Key Persons shall mean … Daniel Roache …" },
    ],
  },
  {
    question: "Are there any undisclosed conflicts of interest?",
    keywords: ["conflict", "broker-dealer", "affiliate", "related party", "securities"],
    answer:
      "Yes. Form ADV Part 2A discloses an affiliated broker-dealer, **Brightwater Securities, LLC**, which receives transaction fees from portfolio company deals. The DDQ's conflicts-of-interest response omits it entirely.\n\nThe affiliate fee stream is a real economic conflict, and its absence from the DDQ is an accuracy failure in the document LPs are asked to rely on.",
    citations: [
      { source_file: "brightwater_adv_part2a.pdf", page: 7, text_snippet: "Brightwater Securities, LLC, an affiliated broker-dealer, receives transaction fees …" },
      { source_file: "brightwater_iv_ddq.pdf", page: 8, text_snippet: "Conflicts of interest: …" },
    ],
  },
  {
    question: "How are Level 3 assets valued?",
    keywords: ["valuation", "level 3", "marks", "committee", "third-party"],
    answer:
      "The valuation policy establishes a quarterly valuation committee, but **Level 3 assets are marked by the GP with third-party review only annually**.\n\nFor a portfolio that is predominantly Level 3, an annual independent review cycle is weak relative to institutional norms, and it means three of four quarterly marks each year carry no external check.",
    citations: [
      { source_file: "brightwater_valuation_policy.pdf", page: 3, text_snippet: "Level 3 investments are valued by the General Partner … independent third-party review annually." },
    ],
  },
  {
    question: "Does the DDQ agree with the fund documents on fees?",
    keywords: ["fee offset", "fees", "100%", "50%", "ddq accuracy"],
    answer:
      "No. The DDQ states a **100% fee offset**. The Fund IV LPA provides for **50%**.\n\nThis is the second of three DDQ answers contradicted by primary documents, alongside the undisclosed Roache departure and the omitted broker-dealer conflict.",
    citations: [
      { source_file: "brightwater_iv_ddq.pdf", page: 5, text_snippet: "100% of transaction and monitoring fees are offset against management fees." },
      { source_file: "brightwater_iv_lpa.pdf", page: 9, text_snippet: "… fifty percent (50%) of such fees shall be applied to reduce the Management Fee." },
    ],
  },
  {
    question: "Has the manager had any regulatory issues?",
    keywords: ["regulatory", "sec", "deficiency", "examination", "litigation"],
    answer:
      "Form ADV Part 2A discloses a **2023 SEC deficiency letter concerning expense allocation**, which the firm reports as remediated.\n\nGiven that expense allocation is the subject, it is worth testing against the fee-offset discrepancy between the DDQ and the LPA.",
    citations: [
      { source_file: "brightwater_adv_part2a.pdf", page: 9, text_snippet: "In 2023, the Adviser received a deficiency letter from the SEC relating to expense allocation …" },
    ],
  },
  {
    question: "Is the GP meeting its reporting obligations to us?",
    keywords: ["reporting", "45 days", "side letter", "quarterly report", "breach", "late"],
    answer:
      "No. The Glenmoor side letter requires quarterly reports within **45 days** of quarter end. The Q2 2026 report is dated **August 29, 2026** — 60 days after the June 30 quarter end.\n\nThat is a breach of undertaking (iv). The annual ESG reporting obligation also cannot be verified from the Q2 pack, which contains no portfolio-level ESG metrics.",
    citations: [
      { source_file: "glenmoor_fund_iii_side_letter.pdf", page: 2, text_snippet: "… quarterly reports within forty-five (45) days of each quarter end …" },
      { source_file: "brightwater_iii_quarterly_q2_2026.pdf", page: 1, text_snippet: "Report date: August 29, 2026 … quarter ended June 30, 2026" },
    ],
  },
];

export function matchDemoQuestion(text: string): DemoAnswer | null {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;

  for (const q of DEMO_QUESTIONS) {
    if (q.question.toLowerCase() === normalized) return q;
  }
  for (const q of DEMO_QUESTIONS) {
    if (q.keywords.some((k) => normalized.includes(k))) return q;
  }
  return null;
}
```

**Before finalising:** cross-check every `page` and `text_snippet` above against the real PDFs in `output/`. The page numbers written here are estimates. A citation that opens the wrong page is worse than no citation.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/fixtures/chat.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Implement the SSE replay and intercept `sseStream`**

Add to `frontend/src/demo/fixtures/chat.ts`:

```ts
import type { SseHandlers } from "@/lib/sse";

/**
 * Streams a canned answer token-by-token so chat looks live. Mirrors the
 * real endpoint's event shape closely enough for the existing consumers.
 */
export function demoSseStream(
  _url: string,
  body: unknown,
  handlers: SseHandlers<unknown>
): AbortController {
  const controller = new AbortController();
  const question =
    typeof body === "object" && body !== null && "query" in body
      ? String((body as { query: unknown }).query ?? "")
      : "";

  const matched = matchDemoQuestion(question);
  const answer = matched?.answer ?? OFF_SCRIPT_ANSWER;
  const citations = matched?.citations ?? [];

  const words = answer.split(/(\s+)/);
  let i = 0;

  const tick = () => {
    if (controller.signal.aborted) return;
    if (i >= words.length) {
      handlers.onEvent({ type: "citations", citations });
      handlers.onFinish?.();
      return;
    }
    handlers.onEvent({ type: "token", token: words[i] });
    i += 1;
    setTimeout(tick, 18);
  };
  setTimeout(tick, 200);

  return controller;
}
```

Confirm the real event shape the chat consumers expect by reading the `onEvent` handlers in `frontend/src/components/assistant/` before finalising `{ type: "token" }` / `{ type: "citations" }`. Match whatever the real backend emits.

Then in `frontend/src/lib/sse.ts`, add at the top of `sseStream`'s body:

```ts
  if (isDemoMode()) {
    // Synchronous import is fine here — chat fixtures are small text.
    return demoSseStream(url, body, handlers as SseHandlers<unknown>);
  }
```

with the imports:

```ts
import { isDemoMode } from "@/demo/mode";
import { demoSseStream } from "@/demo/fixtures/chat";
```

- [ ] **Step 6: Surface the suggested questions as chips**

The app already has a suggested-question mechanism in `frontend/src/lib/queryTemplates.ts`. Read it, and if it drives the chat empty state, add a demo branch returning `DEMO_QUESTIONS.map((q) => q.question)` when `isDemoMode()`. If it does not, add the chips to the chat empty state in `frontend/src/components/assistant/` instead — clicking a chip fills the input and submits.

- [ ] **Step 7: Verify manually**

Backend stopped: open a fund workspace → chat. Click each chip, confirm the answer streams and citations resolve. Then type "what is the weather" and confirm the off-script fallback appears with no fabricated content.

- [ ] **Step 8: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint src`

```bash
git add frontend/src/demo frontend/src/lib/sse.ts
git commit -m "feat(demo): cited chat answers with an honest off-script fallback"
```

---

### Task 8: Remaining surfaces and mutation safety

Deliverable: every reachable surface renders — brief, doc matrix, portfolio, monitoring — and no interaction throws.

**Files:**
- Create: `frontend/src/demo/fixtures/monitoring.ts`
- Create: `frontend/src/demo/fixtures/brief.ts`
- Create: `frontend/src/demo/fixtures/mutations.ts`
- Create: `frontend/src/demo/fixtures/mutations.test.ts`
- Modify: `frontend/src/demo/index.ts`

**Interfaces:**
- Consumes: `registerDemoRoutes` (Task 1), entity ids (Task 2).
- Produces: `registerMonitoringFixtures()`, `registerBriefFixtures()`, `registerMutationFixtures()`

- [ ] **Step 1: Enumerate every unmatched path**

With the backend stopped, walk all five surfaces (`/app`, both `/deal/:id` workspaces and every tab, `/manager/brightwater_capital`, `/portfolio`) with the console open. Write down every `[demo] no fixture for …` line. That list is this task's scope.

- [ ] **Step 2: Write the failing test for mutation safety**

Create `frontend/src/demo/fixtures/mutations.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "@/demo/transport";
import { registerMutationFixtures } from "./mutations";

describe("demo mutations", () => {
  beforeEach(() => {
    resetDemoRoutes();
    registerMutationFixtures();
  });

  it("accepts a findings write and reads it back", async () => {
    const findings = [{ id: "f1", title: "Undisclosed departure" }];
    await demoFetch("/api/deals/brightwater_iv/findings", {
      method: "PUT",
      body: JSON.stringify(findings),
    })!;
    const res = await demoFetch("/api/deals/brightwater_iv/findings", { method: "GET" })!;
    expect(await res.json()).toEqual(findings);
  });

  it("returns an empty list for a deal with no writes", async () => {
    const res = await demoFetch("/api/deals/brightwater_iii/findings", { method: "GET" })!;
    expect(await res.json()).toEqual([]);
  });

  it("accepts brief overrides and reads them back", async () => {
    const overrides = { strategy: "Buyout (edited)" };
    await demoFetch("/api/deals/brightwater_iv/brief-overrides", {
      method: "PUT",
      body: JSON.stringify(overrides),
    })!;
    const res = await demoFetch("/api/deals/brightwater_iv/brief-overrides", {
      method: "GET",
    })!;
    expect(await res.json()).toEqual(overrides);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/demo/fixtures/mutations.test.ts`
Expected: FAIL — `Failed to resolve import "./mutations"`.

- [ ] **Step 4: Implement the in-memory mutation store**

Create `frontend/src/demo/fixtures/mutations.ts`:

```ts
import { registerDemoRoutes } from "@/demo/transport";

/**
 * Writes in the demo land in memory and vanish on reload. This exists so no
 * interaction errors out mid-demo — not to make the demo feel persistent.
 *
 * Destructive controls (delete deal, delete document) are hidden rather than
 * faked; see the demo branches in the components themselves.
 */
const findingsByDeal = new Map<string, unknown>();
const overridesByDeal = new Map<string, unknown>();

export function resetDemoMutations(): void {
  findingsByDeal.clear();
  overridesByDeal.clear();
}

export function registerMutationFixtures(): void {
  registerDemoRoutes([
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/findings$/,
      handler: (m) => findingsByDeal.get(m[1]) ?? [],
    },
    {
      method: "PUT",
      pattern: /^\/api\/deals\/([^/]+)\/findings$/,
      handler: (m, body) => {
        findingsByDeal.set(m[1], body);
        return body;
      },
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/brief-overrides$/,
      handler: (m) => overridesByDeal.get(m[1]) ?? {},
    },
    {
      method: "PUT",
      pattern: /^\/api\/deals\/([^/]+)\/brief-overrides$/,
      handler: (m, body) => {
        overridesByDeal.set(m[1], body);
        return body;
      },
    },
  ]);
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/demo/fixtures/mutations.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Implement the monitoring fixtures**

Create `frontend/src/demo/fixtures/monitoring.ts`. Read the real return types first — `Position`, `PortfolioPosition`, `PortfolioCallNotice`, `PortfolioObligation`, `CallNotice`, `Obligation`, `SideLetterCheck` in `frontend/src/lib/api.ts` — and type the fixtures against them.

Values come from `output/MANIFEST.md`:

- **Glenmoor Fund III position:** $25,000,000 commitment, $18,750,000 paid-in, $6,200,000 distributed, $21,400,000 NAV, DPI 0.33x, RVPI 1.14x, TVPI 1.47x
- **Capital Call No. 7:** issued 2026-07-22, due 2026-07-27, $1,875,000, Project Cardinal, $4,375,000 unfunded after
- **Distribution Notice No. 3:** notice 2026-07-22, pay 2026-08-03, $1,400,000 ($950,000 return of capital, $450,000 gain)
- **Side-letter verdicts** — reproduce the manifest's table exactly: (i) Compliant, (ii) Unclear, (iii) Unclear, **(iv) Breach**, (v) Unclear, (vi) Unclear, (vii) Unclear / potential breach

Register routes for `/api/deals/:id/position`, `/api/deals/:id/call-notices`, `/api/deals/:id/obligations`, `/api/portfolio/positions`, `/api/portfolio/call-notices`, `/api/portfolio/compliance`, and any others your Step 1 list surfaced. Confirm each real path against `frontend/src/lib/api.ts:219-380`.

- [ ] **Step 7: Implement the brief and doc-matrix fixtures**

Create `frontend/src/demo/fixtures/brief.ts` covering whatever brief and doc-matrix paths your Step 1 list surfaced. The brief's content must not contradict the recorded ODD run — where they overlap, reuse the run's text.

- [ ] **Step 8: Hide destructive controls in demo mode**

For each delete control reachable in the demo (deal delete, document delete), wrap the render in `!isDemoMode() && …`. Locate them by searching for `deleteDeal` and `deleteDocument` call sites. Hiding is preferred over faking: a delete that appears to work and then reappears on reload reads as a bug.

- [ ] **Step 9: Re-walk every surface**

Repeat Step 1. The console must show **zero** `[demo] no fixture` lines across all five surfaces and every tab.

- [ ] **Step 10: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint src`

```bash
git add frontend/src/demo frontend/src/components frontend/src/pages
git commit -m "feat(demo): monitoring, brief, and mutation fixtures for full free-roam"
```

---

### Task 9: Demo banner and the landing CTA

Deliverable: the demo is visibly labelled and exitable, and the landing page's "See a demo" enters it.

**Files:**
- Create: `frontend/src/components/DemoBanner.tsx`
- Create: `frontend/src/components/DemoBanner.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/landing/LandingNav.tsx:62-64, 94`

**Interfaces:**
- Consumes: `isDemoMode`, `disableDemoMode` (Task 1).
- Produces: `<DemoBanner />`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/DemoBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DemoBanner from "./DemoBanner";
import { enableDemoMode, disableDemoMode, isDemoMode } from "@/demo/mode";

function renderBanner() {
  return render(
    <MemoryRouter>
      <DemoBanner />
    </MemoryRouter>
  );
}

describe("DemoBanner", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => disableDemoMode());

  it("renders nothing outside demo mode", () => {
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("labels the data as sample and the GP as fictional", () => {
    enableDemoMode();
    renderBanner();
    expect(screen.getByText(/sample data/i)).toBeTruthy();
    expect(screen.getByText(/fictional/i)).toBeTruthy();
  });

  it("offers an exit control", () => {
    enableDemoMode();
    renderBanner();
    expect(screen.getByRole("button", { name: /exit demo/i })).toBeTruthy();
  });

  it("clears the flag when exited", async () => {
    enableDemoMode();
    renderBanner();
    screen.getByRole("button", { name: /exit demo/i }).click();
    expect(isDemoMode()).toBe(false);
  });
});
```

Confirm `@testing-library/react` is already a dev dependency (existing tests such as `HeroSection.test.tsx` use it). If it is not, use the same rendering approach those tests use rather than adding a dependency.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/components/DemoBanner.test.tsx`
Expected: FAIL — `Failed to resolve import "./DemoBanner"`.

- [ ] **Step 3: Implement the banner**

Create `frontend/src/components/DemoBanner.tsx`:

```tsx
import { useNavigate } from "react-router-dom";
import { isDemoMode, disableDemoMode } from "@/demo/mode";

/**
 * Persistent demo label. Because /demo redirects into the real app routes,
 * the URL alone never tells the visitor they are in a demo — this banner is
 * the only signal, and it also has to carry the "fictional GP" disclosure.
 */
export default function DemoBanner() {
  const navigate = useNavigate();
  if (!isDemoMode()) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "6px 12px",
        fontSize: 12.5,
        background: "var(--accent-soft, #f5efe6)",
        borderBottom: "1px solid var(--border)",
        color: "var(--text-1)",
      }}
    >
      <span>
        <strong>Demo — sample data.</strong> Brightwater Capital is fictional.
      </span>
      <button
        type="button"
        onClick={() => {
          disableDemoMode();
          navigate("/");
        }}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        Exit demo
      </button>
    </div>
  );
}
```

Match the surrounding design system rather than these inline styles if the codebase's `Button` primitive and tokens fit — check `frontend/src/components/ui/Button/`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd frontend && npx vitest run src/components/DemoBanner.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Mount the banner above the routes**

In `frontend/src/App.tsx`, import it and render it directly inside `<AuthProvider>`, above `<ErrorBoundary>`:

```tsx
import DemoBanner from "@/components/DemoBanner";
// ...
        <AuthProvider>
          <DemoBanner />
          <ErrorBoundary>
```

- [ ] **Step 6: Point the landing CTA at the demo**

In `frontend/src/components/landing/LandingNav.tsx`, replace lines 62-64:

```tsx
          <LandingButton variant="ink" size="compact" to="/demo">
            Try the demo
          </LandingButton>
```

and add a contact link beside it so lead capture is not lost:

```tsx
          <LandingButton variant="ghost" size="compact" href="#contact">
            Talk to us
          </LandingButton>
```

Replace line 94 in the mobile block the same way:

```tsx
              <LandingButton to="/demo">Try the demo</LandingButton>
              <LandingButton variant="secondary" href="#contact">Talk to us</LandingButton>
```

- [ ] **Step 7: Check the landing page tests still pass**

Run: `cd frontend && npx vitest run src/pages/LandingPage.test.tsx src/components/landing`
If a test asserts the "See a demo" copy, update the assertion to the new copy — do not revert the change.

- [ ] **Step 8: Verify and commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npm run build && npx eslint src`

```bash
git add frontend/src/components frontend/src/App.tsx
git commit -m "feat(demo): demo banner and landing CTA into the demo"
```

---

### Task 10: Backend-stopped acceptance sweep

Deliverable: proof the demo works with no backend at all, plus a regression test that keeps it that way.

**Files:**
- Create: `frontend/src/demo/coverage.test.ts`
- Modify: `docs/todo/README.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the coverage regression test**

Create `frontend/src/demo/coverage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { demoFetch, resetDemoRoutes } from "./transport";
import { registerAllDemoFixtures, __resetRegistration } from "./index";

/**
 * Every path the app is known to request must have a fixture. When a new
 * surface is added and its path is not mocked, this test fails — rather than
 * the demo silently 404-ing in front of a prospect.
 *
 * Add a path here whenever you add one to the app.
 */
const REQUIRED_PATHS: [string, string][] = [
  ["GET", "/api/auth/me"],
  ["GET", "/api/deals"],
  ["GET", "/api/deals/brightwater_iv"],
  ["GET", "/api/deals/brightwater_iv/documents"],
  ["GET", "/api/deals/brightwater_iv/findings"],
  ["GET", "/api/deals/brightwater_iv/brief-overrides"],
  ["GET", "/api/deals/brightwater_iv/position"],
  ["GET", "/api/deals/brightwater_iv/workflows"],
  ["GET", "/api/deals/brightwater_iv/runs"],
  ["GET", "/api/deals/brightwater_iv/documents/brightwater_iv_ddq.pdf/view-token"],
  ["GET", "/api/managers"],
  ["GET", "/api/managers/brightwater_capital"],
  ["GET", "/api/managers/brightwater_capital/funds"],
  ["GET", "/api/portfolio/positions"],
  ["GET", "/api/portfolio/call-notices"],
  ["GET", "/api/portfolio/compliance"],
];

describe("demo fixture coverage", () => {
  beforeEach(() => {
    resetDemoRoutes();
    __resetRegistration();
    registerAllDemoFixtures();
  });

  it.each(REQUIRED_PATHS)("has a fixture for %s %s", (method, path) => {
    expect(demoFetch(path, { method }), `missing fixture: ${method} ${path}`).not.toBeNull();
  });
});
```

Correct any path above that does not match the app's real routes — the list must reflect reality, not this plan's guess. Add every path Task 8 Step 1 surfaced.

- [ ] **Step 2: Add the registration reset hook**

In `frontend/src/demo/index.ts`, export a test-only reset beside `registerAllDemoFixtures`:

```ts
/** Test-only: allow re-registration between test cases. */
export function __resetRegistration(): void {
  registered = false;
}
```

- [ ] **Step 3: Run it and fix every gap**

Run: `cd frontend && npx vitest run src/demo/coverage.test.ts`
Expected: PASS. Any failure is a real missing fixture — add it to the relevant fixtures file.

- [ ] **Step 4: Full backend-stopped acceptance walk**

```bash
cd D:/projects/Vyntic
docker compose stop backend
cd frontend && npm run build && npx vite preview
```

Against the **production build** with the backend down, walk:

1. Landing page → **Try the demo** → lands in `/app`, banner visible
2. Fund list shows both Brightwater funds
3. Fund IV → brief, documents, doc matrix, workflows — every tab renders
4. Fund IV → Workflows → ODD Screen → **Run** → 16 cells stream, `Red flag` / `Monitor` land
5. Click a cell → detail panel → click a citation → the real PDF opens at the cited page
6. Chat → each suggested chip answers with citations; off-script input gives the honest fallback
7. Fund III → monitoring: the 60-day reporting breach is visible
8. `/portfolio` → Glenmoor position, capital call queue, side-letter compliance
9. `/manager/brightwater_capital` → manager and both funds
10. **Exit demo** → returns to `/`, flag cleared
11. Reload `/app` after exiting → redirects to `/login`, not into the demo

Console must be clean of `[demo] no fixture` and of network errors throughout.

- [ ] **Step 5: Confirm demo code stays out of the normal path**

With the backend **running** and no demo flag set, sign in normally and confirm nothing changed: deals load, a real workflow run streams, documents open through the authenticated `/api/.../view` URL. Check the network tab shows real requests.

- [ ] **Step 6: Update the roadmap index**

Add a row to the appropriate table in `docs/todo/README.md` recording the demo-mode work, its spec and plan paths, and its status, following the format of the existing rows.

- [ ] **Step 7: Final verification**

Run from `frontend/`:

```bash
npx tsc --noEmit && npx vitest run && npm run build && npx eslint src
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/demo docs/todo/README.md
git commit -m "test(demo): fixture coverage guard and acceptance sweep"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Entry and mode activation | 1 |
| Demo banner | 9 |
| Transport interception (3 chokepoints) | 1 (`fetchWrapper`), 6 (`subscribeRun`), 7 (`sseStream`) |
| The one non-transport change (`DocumentViewer`) | 3 |
| Fixture data model / typed against real interfaces | Global Constraints + 2, 5 |
| Row axis: 2 rows × 8 columns | 4 (recording), 5 (assertions) |
| Playback: column-major, jittered, `Red flag` / `Monitor` | 6 |
| Content sourcing: record then freeze | 4 |
| Free-roam coverage (5 surfaces) | 2, 8 |
| Chat chips + off-script fallback | 7 |
| Landing page change | 9 |
| Testing (unit, type, component, backend-stopped manual) | throughout; 10 consolidates |
| Risks: drift, un-mocked corner, session contamination, fictional GP | 2/5 (typed fixtures), 10 (coverage guard), 1 (token clearing), 9 (banner) |

No spec requirement is unassigned.

**Known soft spots, flagged rather than hidden:**

- Task 2's `page_count` values and Task 7's citation `page` numbers are written from the corpus's rough shape and **must be verified against the real PDFs**. Both tasks say so explicitly at the point of use.
- Task 5's column-ordering assumption (recorded cells arrive column-major) may not hold; Task 5 Step 3 gives the fallback and Step 5 requires visual confirmation.
- Task 7's SSE event shape (`{ type: "token" }` / `{ type: "citations" }`) is inferred; Task 7 Step 5 requires reading the real consumers before finalising.
- Task 8 is deliberately the least prescriptive task — its scope is defined by what Step 1's console sweep actually surfaces, which cannot be enumerated in advance without running the app.
