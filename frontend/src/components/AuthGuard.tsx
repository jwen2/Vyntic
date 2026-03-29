"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/api";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = getAuthToken();

    if (!token && pathname !== "/login") {
      router.push("/login");
    } else if (token && pathname === "/login") {
      router.push("/");
    }
  }, [pathname, router]);

  // Prevent flash of unauthenticated content
  if (!mounted) {
    return null;
  }

  const token = getAuthToken();
  if (!token && pathname !== "/login") {
    return null;
  }

  return <>{children}</>;
}
