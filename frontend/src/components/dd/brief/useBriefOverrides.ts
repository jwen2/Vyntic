// Analyst overrides for the brief's KV panels: server-backed, with a one-time
// migration of any values left in localStorage by the pre-F3.4 build.
// Extracted from DealBriefDashboard.tsx (FE5.3) with behaviour unchanged.

import { useCallback, useEffect, useState } from "react";
import { getBriefOverrides, putBriefOverrides } from "@/lib/api";
import { OVERRIDE_KEY_PREFIX, type OverrideStore } from "./config";

export interface UseBriefOverrides {
  overrides: OverrideStore;
  /**
   * Set (or, with a blank value, clear) one field's override and persist the
   * whole store. Persistence is best-effort and last-write-wins: a failed PUT
   * is swallowed so the analyst's edit still lands in the UI.
   */
  setOverride: (panelKey: string, label: string, value: string | null) => void;
}

export function useBriefOverrides(dealId: string): UseBriefOverrides {
  const [overrides, setOverrides] = useState<OverrideStore>({});

  // Load overrides from the server; migrate localStorage up once if empty.
  useEffect(() => {
    let active = true;
    const readLocal = (): OverrideStore => {
      try {
        const raw = localStorage.getItem(OVERRIDE_KEY_PREFIX + dealId);
        return raw ? (JSON.parse(raw) as OverrideStore) : {};
      } catch {
        return {};
      }
    };
    (async () => {
      try {
        const server = await getBriefOverrides(dealId);
        if (!active) return;
        if (Object.keys(server).length > 0) {
          setOverrides(server);
          return;
        }
        const local = readLocal();
        if (Object.keys(local).length > 0) {
          setOverrides(local);
          try {
            await putBriefOverrides(dealId, local);
            if (active) localStorage.removeItem(OVERRIDE_KEY_PREFIX + dealId);
          } catch {}
        } else {
          setOverrides({});
        }
      } catch {
        if (active) setOverrides(readLocal());
      }
    })();
    return () => {
      active = false;
    };
  }, [dealId]);

  const setOverride = useCallback(
    (panelKey: string, label: string, value: string | null) => {
      setOverrides((prev) => {
        const panel = { ...(prev[panelKey] || {}) };
        const trimmed = value?.trim() ?? "";
        if (!trimmed) {
          delete panel[label];
        } else {
          panel[label] = trimmed;
        }
        const next: OverrideStore = { ...prev };
        if (Object.keys(panel).length > 0) next[panelKey] = panel;
        else delete next[panelKey];
        // Best-effort server persistence (last-write-wins).
        void putBriefOverrides(dealId, next).catch(() => {});
        return next;
      });
    },
    [dealId]
  );

  return { overrides, setOverride };
}
