import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ThemeProvider from "@/contexts/ThemeContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";

// Route-level code splitting: landing visitors shouldn't download
// react-markdown or the workspace surfaces just to read the marketing page.
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const HomePage = lazy(() => import("@/pages/HomePage"));
const DealWorkspacePage = lazy(() => import("@/pages/DealWorkspacePage"));
const ManagerPage = lazy(() => import("@/pages/ManagerPage"));
const PortfolioPage = lazy(() => import("@/pages/PortfolioPage"));

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="dd-spin"
        style={{
          width: 32,
          height: 32,
          border: "4px solid var(--landing-border)",
          borderTopColor: "#111111",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      {/* AuthProvider sits inside the router so its 401 listener can
          navigate to /login without a full page reload. */}
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/landing" element={<Navigate to="/" replace />} />
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/app"
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
                <Route
                  path="/portfolio"
                  element={
                    <ProtectedRoute>
                      <PortfolioPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/manager/:managerId"
                  element={
                    <ProtectedRoute>
                      <ManagerPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
