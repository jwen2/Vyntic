---
name: verify
description: Build/launch/drive recipe for verifying Vyntic frontend changes end-to-end (dev servers, auth, headless-Edge screenshots)
---

# Verifying Vyntic frontend changes

## Launch

```powershell
# Backend (SQLite branch; from repo root). Creates backend/data on first run.
$env:ALLOW_INSECURE_DEFAULTS="1"
Set-Location backend; New-Item -ItemType Directory -Force data | Out-Null
<venv>\Scripts\python.exe -m uvicorn app.main:app --port 8801
# A working py3.11 venv lives at D:\projects\Vyntic\backend\.venv (usable from worktrees).
# Startup seeds sample deals/PDFs — takes ~30–60s before the port answers (docling missing → PyMuPDF fallback is fine).

# Frontend — vite proxies /api to localhost:8000 by default; override to match:
$env:VITE_API_PROXY_TARGET="http://localhost:8801"
Set-Location frontend; npm run dev -- --port 5199 --strictPort
```

Port 5173 is often occupied by the user's own dev server — always pick an explicit port.

## Auth

- Default admin: `admin@vyntic.com` / `admin` (only valid with `ALLOW_INSECURE_DEFAULTS=1`). Admin owns the seeded sample deals (e.g. `acme_saas`, 6 docs) — use it to reach the deal workspace at `/deal/acme_saas`.
- Self-registered users are non-admin: no "Add deal" button, no access to sample deals (default-deny shows an access banner) — useful as a permissions probe, useless for workspace verification.

## Drive / capture

`npm i --no-save playwright-core` in `frontend/`, then drive installed Edge with `chromium.launch({ channel: "msedge", headless: true })` — no browser download. Login form: two inputs (email, password), submit button "Continue".

- Theme: `localStorage.setItem("vyntic_theme", "dark")` + reload (ThemeContext toggles the `dark` class on `<html>`); the top-bar moon/sun button also works.
- Workspace tabs are buttons: "Agent", "Workflows", "Brief".
- Token probe without auth: `getComputedStyle(document.documentElement).getPropertyValue("--accent")` on any page, before/after adding the `dark` class.

## Gotchas

- Fresh worktrees need `npm ci` in `frontend/` first.
- `npm test -- --run` (vitest), `npm run lint` (warnings-only baseline ~52), `npm run build` (tsc + vite) — CI gates, not verification.
- Stop the backend before deleting `backend/data`.
