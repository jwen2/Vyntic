# Vite SPA Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Next.js frontend to a Vite + React + TypeScript + Tailwind CSS SPA, preserving all existing functionality.

**Architecture:** Keep all existing component logic, hooks, and API layer intact — the primary changes are removing Next.js conventions (`"use client"`, `next/navigation`, file-based routing, `next/image`) and replacing them with React Router v6. A Vite dev proxy replaces Next.js rewrites for `/api` → `http://localhost:8000`.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, React Router v6, react-markdown, recharts, remark-gfm

---

## File Structure

### New files (create)
- `frontend/index.html` — Vite entry point
- `frontend/vite.config.ts` — Vite config with `/api` proxy
- `frontend/tsconfig.json` — TypeScript config with path aliases
- `frontend/tsconfig.node.json` — TS config for vite.config.ts
- `frontend/postcss.config.js` — PostCSS config for Tailwind
- `frontend/tailwind.config.js` — Tailwind config
- `frontend/src/main.tsx` — React entry, mounts `<App />`
- `frontend/src/App.tsx` — React Router routes definition
- `frontend/src/index.css` — Global styles (port from globals.css)
- `frontend/src/contexts/AuthContext.tsx` — Auth state (user, loading, logout)
- `frontend/src/contexts/ThemeContext.tsx` — Port ThemeProvider, remove "use client"
- `frontend/src/lib/api.ts` — Port from old-frontend (remove SSR guards)
- `frontend/src/lib/workflows.ts` — Direct copy
- `frontend/src/lib/citationLabels.ts` — Direct copy
- `frontend/src/lib/diffWords.ts` — Direct copy
- `frontend/src/lib/exportMatrix.ts` — Direct copy
- `frontend/src/lib/markdownUtils.ts` — Direct copy
- `frontend/src/lib/matrixColumnConfig.ts` — Direct copy
- `frontend/src/lib/numericDetector.ts` — Direct copy
- `frontend/src/lib/queryTemplates.ts` — Direct copy
- `frontend/src/lib/useTableState.tsx` — Direct copy, remove "use client"
- `frontend/src/hooks/useDeals.ts` — Port (remove "use client")
- `frontend/src/hooks/useMatrix.ts` — Port (remove "use client")
- `frontend/src/components/**` — Port all components (remove "use client", swap next/navigation)
- `frontend/src/pages/LoginPage.tsx` — Port from app/login/page.tsx
- `frontend/src/pages/HomePage.tsx` — Port from app/page.tsx
- `frontend/src/pages/DealWorkspacePage.tsx` — Port from app/deal/[dealId]/page.tsx
- `frontend/src/pages/LandingPage.tsx` — Port from app/landing/page.tsx
- `frontend/src/components/ProtectedRoute.tsx` — Auth guard wrapper

### Rename
- `frontend/` → `old-frontend/` (git mv before any new work)

---

## Task 1: Rename old frontend

**Files:**
- Rename: `frontend/` → `old-frontend/`

- [ ] **Step 1: Git rename the directory**

```bash
cd /path/to/Vyntic
git mv frontend old-frontend
git status
```

Expected: `old-frontend/` staged as renamed.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: rename frontend to old-frontend before Vite migration"
```

---

## Task 2: Scaffold Vite project

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/postcss.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "vyntic-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tailwindcss/typography": "^0.5.19",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.24.0",
    "react-markdown": "^10.1.0",
    "recharts": "^3.8.0",
    "remark-gfm": "^4.0.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create `frontend/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [require("@tailwindcss/typography")],
};
```

- [ ] **Step 8: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vyntic</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `frontend/src/index.css`**

Copy the contents of `old-frontend/src/app/globals.css` verbatim into this file.

- [ ] **Step 10: Create `frontend/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 11: Create a minimal `frontend/src/App.tsx` (placeholder)**

```tsx
export default function App() {
  return <div>Vyntic loading...</div>;
}
```

- [ ] **Step 12: Verify dev server starts**

```bash
cd frontend
npm run dev
```

Expected: Vite dev server running at `http://localhost:5173`. Browser shows "Vyntic loading...".

- [ ] **Step 13: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite + React + TypeScript + Tailwind project"
```

---

## Task 3: Migrate lib layer

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/workflows.ts`
- Create: `frontend/src/lib/citationLabels.ts`
- Create: `frontend/src/lib/diffWords.ts`
- Create: `frontend/src/lib/exportMatrix.ts`
- Create: `frontend/src/lib/markdownUtils.ts`
- Create: `frontend/src/lib/matrixColumnConfig.ts`
- Create: `frontend/src/lib/numericDetector.ts`
- Create: `frontend/src/lib/queryTemplates.ts`
- Create: `frontend/src/lib/useTableState.tsx`

- [ ] **Step 1: Copy utility libs**

These files have no Next.js dependencies — copy them verbatim:

```bash
cp old-frontend/src/lib/citationLabels.ts frontend/src/lib/citationLabels.ts
cp old-frontend/src/lib/diffWords.ts frontend/src/lib/diffWords.ts
cp old-frontend/src/lib/exportMatrix.ts frontend/src/lib/exportMatrix.ts
cp old-frontend/src/lib/markdownUtils.ts frontend/src/lib/markdownUtils.ts
cp old-frontend/src/lib/matrixColumnConfig.ts frontend/src/lib/matrixColumnConfig.ts
cp old-frontend/src/lib/numericDetector.ts frontend/src/lib/numericDetector.ts
cp old-frontend/src/lib/queryTemplates.ts frontend/src/lib/queryTemplates.ts
cp old-frontend/src/lib/workflows.ts frontend/src/lib/workflows.ts
```

- [ ] **Step 2: Copy and fix `useTableState.tsx`**

```bash
cp old-frontend/src/lib/useTableState.tsx frontend/src/lib/useTableState.tsx
```

Then open `frontend/src/lib/useTableState.tsx` and remove the `"use client";` line at the top (line 1) if present.

- [ ] **Step 3: Port `api.ts` — remove SSR guards**

Copy the file:

```bash
cp old-frontend/src/lib/api.ts frontend/src/lib/api.ts
```

Then open `frontend/src/lib/api.ts` and make these two changes:

1. In `getAuthToken`, change:
```typescript
// BEFORE
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
```
to:
```typescript
// AFTER
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
```

2. In `setAuthToken`, change:
```typescript
// BEFORE
export function setAuthToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }
}
```
to:
```typescript
// AFTER
export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
```

3. In `clearAuthToken`, change:
```typescript
// BEFORE
export function clearAuthToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
}
```
to:
```typescript
// AFTER
export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}
```

4. In `fetchWrapper`, remove the SSR guard around the redirect:
```typescript
// BEFORE
if (response.status === 401) {
  clearAuthToken();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}
```
to:
```typescript
// AFTER
if (response.status === 401) {
  clearAuthToken();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}
```

5. Apply the same SSR guard removal in the `xhrUpload` function's `xhr.onload` handler — remove `typeof window !== "undefined" &&` from the redirect check.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/
git commit -m "feat: migrate lib layer to Vite SPA"
```

---

## Task 4: Migrate hooks

**Files:**
- Create: `frontend/src/hooks/useDeals.ts`
- Create: `frontend/src/hooks/useMatrix.ts`

- [ ] **Step 1: Copy and fix `useDeals.ts`**

```bash
cp old-frontend/src/hooks/useDeals.ts frontend/src/hooks/useDeals.ts
```

Open `frontend/src/hooks/useDeals.ts` and:
- Remove the `"use client";` line at the top.
- Change the import path: `from "@/lib/api"` stays the same (alias is configured).

- [ ] **Step 2: Copy and fix `useMatrix.ts`**

```bash
cp old-frontend/src/hooks/useMatrix.ts frontend/src/hooks/useMatrix.ts
```

Open `frontend/src/hooks/useMatrix.ts` and remove the `"use client";` line at the top.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/
git commit -m "feat: migrate hooks to Vite SPA"
```

---

## Task 5: Auth and Theme contexts

**Files:**
- Create: `frontend/src/contexts/AuthContext.tsx`
- Create: `frontend/src/contexts/ThemeContext.tsx`

- [ ] **Step 1: Create `frontend/src/contexts/ThemeContext.tsx`**

Copy `old-frontend/src/components/ThemeProvider.tsx` to `frontend/src/contexts/ThemeContext.tsx`, then:
- Remove `"use client";` from line 1.
- No other changes needed.

```bash
cp old-frontend/src/components/ThemeProvider.tsx frontend/src/contexts/ThemeContext.tsx
# Then remove "use client"; from line 1
```

- [ ] **Step 2: Create `frontend/src/contexts/AuthContext.tsx`**

```tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { User, getMe, getAuthToken, clearAuthToken } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => clearAuthToken())
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    clearAuthToken();
    setUser(null);
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Create `frontend/src/components/ProtectedRoute.tsx`**

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950">
        <div
          className="animate-spin"
          style={{
            width: 28,
            height: 28,
            border: "3px solid #2563eb",
            borderTopColor: "transparent",
            borderRadius: "50%",
          }}
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/contexts/ frontend/src/components/ProtectedRoute.tsx
git commit -m "feat: add AuthContext, ThemeContext, and ProtectedRoute"
```

---

## Task 6: Wire up App.tsx with routing

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Replace placeholder `App.tsx` with full router**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import HomePage from "@/pages/HomePage";
import DealWorkspacePage from "@/pages/DealWorkspacePage";
import LandingPage from "@/pages/LandingPage";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deal/:dealId"
              element={
                <ProtectedRoute>
                  <DealWorkspacePage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

Note: This will cause TypeScript errors until the page files exist. That's expected — they get created in Tasks 7–10.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up React Router v6 routes in App.tsx"
```

---

## Task 7: Migrate LoginPage

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Copy and adapt `LoginPage.tsx`**

```bash
cp old-frontend/src/app/login/page.tsx frontend/src/pages/LoginPage.tsx
```

Open `frontend/src/pages/LoginPage.tsx` and make these changes:

1. Remove `"use client";` from line 1.

2. Replace the import for `useTheme`:
```typescript
// BEFORE
import { useTheme } from "@/components/ThemeProvider";
// AFTER
import { useTheme } from "@/contexts/ThemeContext";
```

3. Replace `window.location.href = "/"` with:
```typescript
// BEFORE
window.location.href = "/";
// AFTER
import { useNavigate } from "react-router-dom";
// ... inside the component:
const navigate = useNavigate();
// ... inside handleSubmit on success:
navigate("/");
```

Full import block after changes:
```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "@/lib/api";
import { useTheme } from "@/contexts/ThemeContext";
```

Full `handleSubmit` success block:
```typescript
if (isLogin) {
  await login(email, password);
} else {
  await register(email, password, fullName);
}
navigate("/");
```

- [ ] **Step 2: Verify no remaining Next.js imports**

```bash
grep -n "next/" frontend/src/pages/LoginPage.tsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: migrate LoginPage to Vite SPA"
```

---

## Task 8: Migrate shared components

**Files:**
- Create: `frontend/src/components/ThemeProvider.tsx` (re-export from context)
- Create: `frontend/src/components/AddDealDialog.tsx`
- Create: `frontend/src/components/ConfirmDialog.tsx`
- Create: `frontend/src/components/DocumentViewer.tsx`
- Create: `frontend/src/components/CitationPopover.tsx`
- Create: `frontend/src/components/InlineCitation.tsx`
- Create: `frontend/src/components/ConversationHistory.tsx`
- Create: `frontend/src/components/DealCard.tsx`
- Create: `frontend/src/components/DealDetailPanel.tsx`
- Create: `frontend/src/components/DocMatrixPanel.tsx`
- Create: `frontend/src/components/MatrixGrid.tsx`
- Create: `frontend/src/components/MatrixCell.tsx`
- Create: `frontend/src/components/UploadPanel.tsx`

- [ ] **Step 1: Copy all shared components**

```bash
cp old-frontend/src/components/AddDealDialog.tsx frontend/src/components/AddDealDialog.tsx
cp old-frontend/src/components/ConfirmDialog.tsx frontend/src/components/ConfirmDialog.tsx
cp old-frontend/src/components/DocumentViewer.tsx frontend/src/components/DocumentViewer.tsx
cp old-frontend/src/components/CitationPopover.tsx frontend/src/components/CitationPopover.tsx
cp old-frontend/src/components/InlineCitation.tsx frontend/src/components/InlineCitation.tsx
cp old-frontend/src/components/ConversationHistory.tsx frontend/src/components/ConversationHistory.tsx
cp old-frontend/src/components/DealCard.tsx frontend/src/components/DealCard.tsx
cp old-frontend/src/components/DealDetailPanel.tsx frontend/src/components/DealDetailPanel.tsx
cp old-frontend/src/components/DocMatrixPanel.tsx frontend/src/components/DocMatrixPanel.tsx
cp old-frontend/src/components/MatrixGrid.tsx frontend/src/components/MatrixGrid.tsx
cp old-frontend/src/components/MatrixCell.tsx frontend/src/components/MatrixCell.tsx
cp old-frontend/src/components/UploadPanel.tsx frontend/src/components/UploadPanel.tsx
```

- [ ] **Step 2: Create `frontend/src/components/ThemeProvider.tsx` as a re-export**

So that any component doing `import { useTheme } from "@/components/ThemeProvider"` still works:

```typescript
export { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
```

- [ ] **Step 3: Strip `"use client"` from all copied components**

```bash
# Preview which files have it
grep -rl '"use client"' frontend/src/components/

# Remove the directive from each file
sed -i '' '1{/^"use client";$/d}' frontend/src/components/*.tsx
```

- [ ] **Step 4: Check for `next/` imports in components**

```bash
grep -rn "from \"next/" frontend/src/components/
```

Fix any hits by replacing with React Router equivalents:
- `import { useRouter } from "next/navigation"` → `import { useNavigate } from "react-router-dom"` and replace `router.push(path)` with `navigate(path)`
- `import { useParams } from "next/navigation"` → `import { useParams } from "react-router-dom"`
- `import Image from "next/image"` → remove, use `<img>` tag

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/
git commit -m "feat: migrate shared components to Vite SPA"
```

---

## Task 9: Migrate home page sub-components

**Files:**
- Create: `frontend/src/components/home/DealListItem.tsx`
- Create: `frontend/src/components/home/HomeSidebar.tsx`
- Create: `frontend/src/components/home/HomeTopBar.tsx`

- [ ] **Step 1: Copy home sub-components**

```bash
mkdir -p frontend/src/components/home
cp old-frontend/src/components/home/DealListItem.tsx frontend/src/components/home/DealListItem.tsx
cp old-frontend/src/components/home/HomeSidebar.tsx frontend/src/components/home/HomeSidebar.tsx
cp old-frontend/src/components/home/HomeTopBar.tsx frontend/src/components/home/HomeTopBar.tsx
```

- [ ] **Step 2: Strip `"use client"` and fix next/ imports**

```bash
sed -i '' '1{/^"use client";$/d}' frontend/src/components/home/*.tsx
grep -n "from \"next/" frontend/src/components/home/*.tsx
```

Replace any `next/navigation` imports per the pattern in Task 8, Step 4.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/home/
git commit -m "feat: migrate home sub-components"
```

---

## Task 10: Migrate HomePage

**Files:**
- Create: `frontend/src/pages/HomePage.tsx`

- [ ] **Step 1: Copy and adapt**

```bash
cp old-frontend/src/app/page.tsx frontend/src/pages/HomePage.tsx
```

Open `frontend/src/pages/HomePage.tsx` and make these changes:

1. Remove `"use client";`.

2. Replace Next.js router import and usage:
```typescript
// BEFORE
import { useRouter } from "next/navigation";
// ...
const router = useRouter();
// ...
router.push(`/deal/${deal.deal_id}`);
```
```typescript
// AFTER
import { useNavigate } from "react-router-dom";
// ...
const navigate = useNavigate();
// ...
navigate(`/deal/${deal.deal_id}`);
```

3. Replace the ThemeProvider import:
```typescript
// BEFORE
import { useTheme } from "@/components/ThemeProvider";
// AFTER — no change needed (ThemeProvider.tsx now re-exports from context)
```

4. Replace the auth loading block — instead of calling `getMe()` and `getAuthToken()` directly in this page, use `useAuth()`:
```typescript
// BEFORE
import { getMe, getAuthToken, clearAuthToken, ... } from "@/lib/api";
// ... useEffect checking token and calling getMe()
// ... const [user, setUser] = useState<User | null>(null);
// ... const [authLoading, setAuthLoading] = useState(true);
```
```typescript
// AFTER
import { useAuth } from "@/contexts/AuthContext";
// ... const { user, logout } = useAuth();
// Remove authLoading state and the useEffect that checks token/calls getMe
// Replace handleLogout body with: logout()
```

5. Remove the `authLoading` spinner block — `ProtectedRoute` now handles that.

6. Remove the early return guard `if (authLoading || !user)` — user is guaranteed to be non-null inside `ProtectedRoute`.

- [ ] **Step 2: Verify no next/ imports remain**

```bash
grep -n "from \"next/" frontend/src/pages/HomePage.tsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/HomePage.tsx
git commit -m "feat: migrate HomePage to Vite SPA"
```

---

## Task 11: Migrate deal workspace components

**Files:**
- Create: `frontend/src/components/dd/` (all files)
- Create: `frontend/src/components/assistant/DealAssistantPanel.tsx`
- Create: `frontend/src/components/workflows/` (all files)

- [ ] **Step 1: Copy dd components**

```bash
mkdir -p frontend/src/components/dd
cp old-frontend/src/components/dd/*.tsx frontend/src/components/dd/
cp old-frontend/src/components/dd/*.ts frontend/src/components/dd/
```

- [ ] **Step 2: Copy assistant components**

```bash
mkdir -p frontend/src/components/assistant
cp old-frontend/src/components/assistant/DealAssistantPanel.tsx frontend/src/components/assistant/DealAssistantPanel.tsx
```

- [ ] **Step 3: Copy workflow components**

```bash
mkdir -p frontend/src/components/workflows/cells
cp old-frontend/src/components/workflows/*.tsx frontend/src/components/workflows/
cp old-frontend/src/components/workflows/*.ts frontend/src/components/workflows/
cp old-frontend/src/components/workflows/cells/*.tsx frontend/src/components/workflows/cells/
```

- [ ] **Step 4: Strip `"use client"` from all**

```bash
find frontend/src/components/dd frontend/src/components/assistant frontend/src/components/workflows \
  -name "*.tsx" -o -name "*.ts" | xargs sed -i '' '1{/^"use client";$/d}'
```

- [ ] **Step 5: Check for next/ imports**

```bash
grep -rn "from \"next/" frontend/src/components/dd/ frontend/src/components/assistant/ frontend/src/components/workflows/
```

Fix per Task 8 Step 4 pattern. The deal workspace does not use `useRouter` or `useParams` internally — any navigation is passed down as a prop or uses `window.location`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/dd/ frontend/src/components/assistant/ frontend/src/components/workflows/
git commit -m "feat: migrate deal workspace components to Vite SPA"
```

---

## Task 12: Migrate DealWorkspacePage

**Files:**
- Create: `frontend/src/pages/DealWorkspacePage.tsx`

- [ ] **Step 1: Copy and adapt**

```bash
cp "old-frontend/src/app/deal/[dealId]/page.tsx" frontend/src/pages/DealWorkspacePage.tsx
```

Open `frontend/src/pages/DealWorkspacePage.tsx` and make these changes:

1. Remove `"use client";`.

2. Replace next/navigation imports:
```typescript
// BEFORE
import { useParams, useRouter } from "next/navigation";
```
```typescript
// AFTER
import { useParams, useNavigate } from "react-router-dom";
```

3. Replace router usage:
```typescript
// BEFORE
const params = useParams();
const router = useRouter();
const dealId = params.dealId as string;
// ... router.push(...)
```
```typescript
// AFTER
const { dealId } = useParams<{ dealId: string }>();
const navigate = useNavigate();
// ... navigate(...)
```

4. Replace the ThemeProvider import if needed (should be fine via re-export).

5. Remove any `getAuthToken()` check — auth is guaranteed by `ProtectedRoute`.

- [ ] **Step 2: Verify**

```bash
grep -n "from \"next/" frontend/src/pages/DealWorkspacePage.tsx
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DealWorkspacePage.tsx
git commit -m "feat: migrate DealWorkspacePage to Vite SPA"
```

---

## Task 13: Migrate landing page

**Files:**
- Create: `frontend/src/pages/LandingPage.tsx`
- Create: `frontend/src/components/landing/` (all files)

- [ ] **Step 1: Copy landing components**

```bash
mkdir -p frontend/src/components/landing
cp old-frontend/src/components/landing/*.tsx frontend/src/components/landing/
```

- [ ] **Step 2: Strip `"use client"` and fix next/ imports**

```bash
sed -i '' '1{/^"use client";$/d}' frontend/src/components/landing/*.tsx
grep -n "from \"next/" frontend/src/components/landing/*.tsx
```

Replace any `next/link` `<Link href="...">` with `<a href="...">` or React Router `<Link to="...">` from `react-router-dom`.

- [ ] **Step 3: Create `frontend/src/pages/LandingPage.tsx`**

```tsx
import LandingNav from "@/components/landing/LandingNav";
import HeroSection from "@/components/landing/HeroSection";
import LogoStrip from "@/components/landing/LogoStrip";
import FeatureCards from "@/components/landing/FeatureCards";
import HowItWorks from "@/components/landing/HowItWorks";
import Testimonials from "@/components/landing/Testimonials";
import PricingSection from "@/components/landing/PricingSection";
import FinalCTA from "@/components/landing/FinalCTA";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <LogoStrip />
        <FeatureCards />
        <HowItWorks />
        <Testimonials />
        <PricingSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/landing/ frontend/src/pages/LandingPage.tsx
git commit -m "feat: migrate landing page to Vite SPA"
```

---

## Task 14: TypeScript build check and fix

**Files:** Any file with TS errors

- [ ] **Step 1: Run tsc**

```bash
cd frontend
npx tsc --noEmit
```

- [ ] **Step 2: Fix errors**

Common errors to expect and fix:

**Missing module** (`Cannot find module '@/contexts/ThemeContext'`): verify the file exists and the path is spelled correctly.

**Type mismatch on `useParams`**: In React Router v6, `useParams` returns `Readonly<Params<string>>`. If `dealId` is possibly undefined, add a non-null assertion or early return:
```typescript
const { dealId } = useParams<{ dealId: string }>();
if (!dealId) return null;
```

**`next/navigation` still imported**: search and replace as described in prior tasks.

**`window.location.href` in `api.ts`**: safe in browser-only SPA, no change needed.

- [ ] **Step 3: Re-run until clean**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit all fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors after Vite migration"
```

---

## Task 15: Smoke test all routes

- [ ] **Step 1: Start backend**

```bash
cd backend
SEED_SAMPLE_DATA=false uvicorn app.main:app --reload
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend
npm run dev
```

- [ ] **Step 3: Test each route**

| Route | Expected |
|---|---|
| `http://localhost:5173/landing` | Landing page renders with nav, hero, sections |
| `http://localhost:5173/login` | Login form renders; submit with `admin@vyntic.com` / `admin` succeeds and redirects to `/` |
| `http://localhost:5173/` | Home page renders with deal sidebar |
| `http://localhost:5173/deal/<deal_id>` | Deal workspace renders with Agent/Workflows/Brief tabs |
| `http://localhost:5173/anything-else` | Redirects to `/` |
| Unauthenticated access to `/` | Redirects to `/login` |

- [ ] **Step 4: Test API proxy**

Open browser devtools Network tab. Log in and confirm requests to `/api/auth/login` return 200 (not 404 or CORS error).

- [ ] **Step 5: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix: smoke test fixes post-migration"
```

---

## Task 16: Final cleanup

- [ ] **Step 1: Verify `old-frontend` is untouched**

```bash
ls old-frontend/
```

Expected: original Next.js project still intact.

- [ ] **Step 2: Update root-level README or docs if they reference `frontend/`**

Check `README.md` for references to `npm run dev` inside `frontend/`. Verify instructions still apply (they do — the new `frontend/` also uses `npm run dev`).

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Vite SPA migration complete, old-frontend preserved"
```
