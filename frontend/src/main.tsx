import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import "./components/ui/button.css";
import "./components/ui/modal.css";
import "./components/ui/card.css";

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
