
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAuthToken } from "@/lib/api";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = getAuthToken();

    const publicPaths = ["/login", "/landing"];
    if (!token && !publicPaths.includes(pathname)) {
      navigate("/login");
    } else if (token && pathname === "/login") {
      navigate("/");
    }
  }, [pathname, router]);

  // Prevent flash of unauthenticated content
  if (!mounted) {
    return null;
  }

  const token = getAuthToken();
  const publicPaths = ["/login", "/landing"];
  if (!token && !publicPaths.includes(pathname)) {
    return null;
  }

  return <>{children}</>;
}
