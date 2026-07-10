import React from "react";
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
            border: "3px solid var(--accent)",
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
