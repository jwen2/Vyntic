import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { isDemoMode } from "@/demo/mode";

import "./index.css";
import "./components/ui/Button/index.css";
import "./components/ui/Modal/index.css";
import "./components/ui/Card/index.css";
import "./components/ui/Input/index.css";
import "./components/ui/grid-table.css";

// Conservative defaults: server data is considered fresh for 30s (matrix/run
// results don't change under the user mid-screen), and one retry is enough —
// ApiError messages are user-visible, so failing fast beats hiding errors
// behind long retry loops.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function render() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

/**
 * The demo module is imported dynamically so its fixtures — and the two
 * recordings behind them, 126 kB of JSON — stay out of the entry chunk. The
 * guard here has always been conditional, but a static import ships the code
 * regardless, and since the landing page now offers "Try the demo" to the
 * public, every marketing visitor was paying for a corpus they may never load.
 *
 * The await is load-bearing, not stylistic. Fixtures must be registered before
 * the app makes its first request: AuthProvider bootstraps on mount, and if it
 * gets there first it calls a real backend that is not there. Rendering only
 * after the import resolves preserves the ordering the synchronous version
 * gave us for free.
 */
if (isDemoMode()) {
  void import("@/demo")
    .then((demo) => demo.registerAllDemoFixtures())
    .catch(() => {
      // A blocked or stale chunk leaves no fixtures. Render anyway: the app
      // falls back to its real, unauthenticated behaviour, which is a login
      // page rather than a blank screen.
    })
    .finally(render);
} else {
  render();
}
