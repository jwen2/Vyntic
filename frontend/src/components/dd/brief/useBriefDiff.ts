// Scan-to-scan change tracking: snapshots the KV panels before a re-run, then
// diffs them once the new run's cells finish streaming. The snapshot is
// persisted per deal in localStorage so the "what changed" pill survives a
// reload. Extracted from DealBriefDashboard.tsx (FE5.3), behaviour unchanged.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  DIFF_KEY_PREFIX,
  type BriefEntityConfig,
  type BriefField,
  type BriefWorkstreamShim,
  type OverrideStore,
  type QuestionResult,
} from "./config";
import { diffPanel, mergeOverrides, type BriefDiffSnapshot } from "./diff";
import { pairsToFields } from "./parse";

export interface UseBriefDiffArgs {
  dealId: string;
  brief: BriefEntityConfig;
  scanWorkstream: BriefWorkstreamShim | null;
  scanResults: Record<string, QuestionResult>;
  overrides: OverrideStore;
  /** Current fields, snapshotted as the "before" side when a re-run starts. */
  snapshotFields: BriefField[];
  transactionFields: BriefField[];
  lastScanAt: number | null;
  refreshing: boolean;
  hasAnyCompleted: boolean;
  isLoading: boolean;
  kickOffRun: () => Promise<void>;
}

export interface UseBriefDiff {
  diff: BriefDiffSnapshot | null;
  diffOpen: boolean;
  /** Full setter, not a narrowed `(open: boolean) => void`: call sites use the
   *  functional-updater form to toggle. */
  setDiffOpen: Dispatch<SetStateAction<boolean>>;
  rerunning: boolean;
  handleRerun: () => void;
  dismissDiff: () => void;
}

export function useBriefDiff({
  dealId,
  brief,
  scanWorkstream,
  scanResults,
  overrides,
  snapshotFields,
  transactionFields,
  lastScanAt,
  refreshing,
  hasAnyCompleted,
  isLoading,
  kickOffRun,
}: UseBriefDiffArgs): UseBriefDiff {
  const [rerunning, setRerunning] = useState(false);
  const [diff, setDiff] = useState<BriefDiffSnapshot | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const beforeSnapshotRef = useRef<{
    snapshot: BriefField[];
    transaction: BriefField[];
    previousAt?: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(DIFF_KEY_PREFIX + dealId);
      setDiff(raw ? (JSON.parse(raw) as BriefDiffSnapshot) : null);
    } catch {
      setDiff(null);
    }
    setDiffOpen(false);
  }, [dealId]);

  const persistDiff = useCallback(
    (next: BriefDiffSnapshot | null) => {
      setDiff(next);
      if (typeof window === "undefined") return;
      try {
        if (next) localStorage.setItem(DIFF_KEY_PREFIX + dealId, JSON.stringify(next));
        else localStorage.removeItem(DIFF_KEY_PREFIX + dealId);
      } catch {}
    },
    [dealId]
  );

  const handleRerun = useCallback(() => {
    if (refreshing || !scanWorkstream) return;
    beforeSnapshotRef.current = {
      snapshot: snapshotFields.map((f) => ({ ...f })),
      transaction: transactionFields.map((f) => ({ ...f })),
      previousAt: lastScanAt ?? undefined,
    };
    setRerunning(true);
    void kickOffRun().finally(() => setRerunning(false));
    // Diff snapshot logic stays — once the new run completes the hook updates
    // scanResults via SSE and the field-extraction below re-derives fields.
    // We compute the diff in a separate effect (see below).
  }, [kickOffRun, lastScanAt, refreshing, scanWorkstream, snapshotFields, transactionFields]);

  // After a rerun completes, compute the diff against the snapshot we took
  // at kickoff time. `rerunning` flips to false once the new run is queued,
  // but we want to wait until ALL cells are complete to compare.
  //
  // The dependency array is deliberately trimmed to the three run-state flags:
  // widening it to the field arrays would re-fire this on every keystroke of an
  // analyst override and clobber the snapshot. Preserved verbatim from the
  // pre-extraction component — do not "fix" it.
  useEffect(() => {
    if (rerunning) return;
    const before = beforeSnapshotRef.current;
    if (!before) return;
    if (!hasAnyCompleted || isLoading) return;
    if (!scanWorkstream) return;
    const newSnapshotFields = mergeOverrides(
      pairsToFields(
        scanResults[scanWorkstream.templates.find((t) => t.label === brief.snapshotLabel)?.query || ""]?.formatted,
        brief.snapshotFields,
      ),
      overrides.snapshot,
      brief.snapshotFields,
    );
    const newTransactionFields = mergeOverrides(
      pairsToFields(
        scanResults[scanWorkstream.templates.find((t) => t.label === brief.transactionLabel)?.query || ""]?.formatted,
        brief.transactionFields,
      ),
      overrides.transaction,
      brief.transactionFields,
    );
    const changes = [
      ...diffPanel("snapshot", brief.snapshotLabel, before.snapshot, newSnapshotFields),
      ...diffPanel("transaction", brief.transactionDiffLabel, before.transaction, newTransactionFields),
    ];
    const next: BriefDiffSnapshot = { changes, at: Date.now(), previousAt: before.previousAt };
    persistDiff(next);
    if (changes.length > 0) setDiffOpen(true);
    beforeSnapshotRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnyCompleted, isLoading, rerunning]);

  const dismissDiff = useCallback(() => {
    persistDiff(null);
    setDiffOpen(false);
  }, [persistDiff]);

  return { diff, diffOpen, setDiffOpen, rerunning, handleRerun, dismissDiff };
}
