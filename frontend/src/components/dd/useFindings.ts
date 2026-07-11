import { useCallback, useEffect, useRef, useState } from "react";
import { getDealFindings, putDealFindings } from "@/lib/api";
import type { Finding, FindingStatus } from "./types";

const LOCAL_KEY = (dealId: string) => `vyntic_findings_${dealId}`;

// Legacy localStorage read — kept only as the one-time migration source.
function loadLocalFindings(dealId: string): Finding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY(dealId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Finding & { origin?: string | null }>;
    // Migrate legacy origin: "agent" → null (Agent feature retired 2026-05-12).
    return parsed.map((f) =>
      f && (f.origin as string | null) === "agent" ? { ...f, origin: null } : f
    ) as Finding[];
  } catch {}
  return [];
}

function clearLocalFindings(dealId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_KEY(dealId));
  } catch {}
}

export function useFindings(dealId: string) {
  const [findings, setFindings] = useState<Finding[]>([]);
  // Ref so the mutation callbacks stay stable across dealId changes while
  // always persisting to the current deal.
  const dealIdRef = useRef(dealId);
  dealIdRef.current = dealId;

  // Load from the server; migrate localStorage up once if the server is empty.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const server = await getDealFindings<Finding>(dealId);
        if (!active) return;
        if (server.length > 0) {
          setFindings(server);
          return;
        }
        const local = loadLocalFindings(dealId);
        if (local.length > 0) {
          setFindings(local);
          try {
            await putDealFindings(dealId, local);
            if (active) clearLocalFindings(dealId);
          } catch {}
        } else {
          setFindings([]);
        }
      } catch {
        // Server unavailable — fall back to local (read-only, no migration).
        if (active) setFindings(loadLocalFindings(dealId));
      }
    })();
    return () => {
      active = false;
    };
  }, [dealId]);

  // Best-effort server persistence (last-write-wins), mirroring the old
  // fire-and-forget localStorage write so callers keep their sync signatures.
  const persist = useCallback((next: Finding[]) => {
    void putDealFindings(dealIdRef.current, next).catch(() => {});
    return next;
  }, []);

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
