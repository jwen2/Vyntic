"use client";
import { useCallback, useEffect, useState } from "react";
import type { Finding, FindingStatus } from "./types";

const KEY = (dealId: string) => `vyntic_findings_${dealId}`;

function loadFindings(dealId: string): Finding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(dealId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Finding & { origin?: string | null }>;
    // Migrate legacy origin: "agent" → null (Agent feature retired 2026-05-12).
    // Findings with that origin still render in the deal's risk list — they just
    // route through the default workstream-based path, not an agent-specific one.
    return parsed.map((f) =>
      f && (f.origin as string | null) === "agent" ? { ...f, origin: null } : f
    ) as Finding[];
  } catch {}
  return [];
}

function saveFindings(dealId: string, findings: Finding[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(dealId), JSON.stringify(findings));
  } catch {}
}

export function useFindings(dealId: string) {
  const [findings, setFindings] = useState<Finding[]>([]);

  useEffect(() => {
    setFindings(loadFindings(dealId));
  }, [dealId]);

  const persist = useCallback(
    (next: Finding[]) => {
      saveFindings(dealId, next);
      return next;
    },
    [dealId]
  );

  const addFindings = useCallback(
    (items: Finding[]) => {
      setFindings((prev) => {
        const existing = new Set(prev.map((f) => f.id));
        const merged = [...prev, ...items.filter((f) => !existing.has(f.id))];
        return persist(merged);
      });
    },
    [persist]
  );

  const setStatus = useCallback(
    (id: string, status: FindingStatus) => {
      setFindings((prev) =>
        persist(prev.map((f) => (f.id === id ? { ...f, status } : f)))
      );
    },
    [persist]
  );

  const setNote = useCallback(
    (id: string, note: string | null) => {
      setFindings((prev) =>
        persist(prev.map((f) => (f.id === id ? { ...f, note } : f)))
      );
    },
    [persist]
  );

  const removeFinding = useCallback(
    (id: string) => {
      setFindings((prev) => persist(prev.filter((f) => f.id !== id)));
    },
    [persist]
  );

  const clearFindings = useCallback(() => {
    setFindings(persist([]));
  }, [persist]);

  /**
   * Replace all findings whose `origin === "scan"` with `scanItems`, preserving
   * user edits (status / note) for findings that still exist by stable id.
   * Non-scan findings are left alone.
   */
  const syncScanFindings = useCallback(
    (scanItems: Finding[]) => {
      setFindings((prev) => {
        const prevScanById = new Map(
          prev.filter((f) => f.origin === "scan").map((f) => [f.id, f])
        );
        const nonScan = prev.filter((f) => f.origin !== "scan");
        const mergedScan = scanItems.map((f) => {
          const existing = prevScanById.get(f.id);
          return existing
            ? { ...f, status: existing.status, note: existing.note }
            : f;
        });
        return persist([...nonScan, ...mergedScan]);
      });
    },
    [persist]
  );

  return {
    findings,
    addFindings,
    setStatus,
    setNote,
    removeFinding,
    clearFindings,
    syncScanFindings,
  };
}
