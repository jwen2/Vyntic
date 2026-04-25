"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AgentRoutePage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;

  useEffect(() => {
    router.replace(`/deal/${dealId}`);
  }, [dealId, router]);

  return null;
}
