// The brief's header card: title, run status pills, actions, and the
// coverage/severity stat row. Extracted from DealBriefDashboard.tsx (FE5.4)
// so the shell holds only hook wiring, derived state, and panel composition.

import type { Dispatch, SetStateAction } from "react";
import Button from "@/components/ui/Button";
import { ddTheme } from "../types";
import type { BriefEntityConfig } from "./config";
import type { BriefDiffSnapshot } from "./diff";
import {
  BriefStatCard,
  DiffPill,
  FreshnessPill,
  SourcePill,
  StatusPill,
} from "./parts";

export interface BriefHeaderProps {
  theme: "light" | "dark";
  brief: BriefEntityConfig;
  completed: number;
  total: number;
  isLoading: boolean;
  rerunning: boolean;
  refreshing: boolean;
  scanStarted: boolean;
  lastScanAt: number | null;
  diff: BriefDiffSnapshot | null;
  diffOpen: boolean;
  setDiffOpen: Dispatch<SetStateAction<boolean>>;
  sourceCount: number;
  dealBreakerCount: number;
  materialCount: number;
  inconsistencyCount: number;
  onRerun: () => void;
  onOpenProactiveScan: () => void;
}

export default function BriefHeader({
  theme,
  brief,
  completed,
  total,
  isLoading,
  rerunning,
  refreshing,
  scanStarted,
  lastScanAt,
  diff,
  diffOpen,
  setDiffOpen,
  sourceCount,
  dealBreakerCount,
  materialCount,
  inconsistencyCount,
  onRerun,
  onOpenProactiveScan,
}: BriefHeaderProps) {
  const c = ddTheme(theme);
  return (
  <div
    style={{
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 28,
      padding: "20px",
      boxShadow: theme === "dark"
        ? "0 16px 34px rgba(0,0,0,0.44)"
        : "0 12px 30px rgba(17,17,17,0.11), 0 1px 2px rgba(17,17,17,0.05)",
    }}
  >
    <div
      className="font-mono-plex"
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: c.t3,
      }}
    >
      Automated brief
    </div>

    <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div style={{ maxWidth: 760 }}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 600, color: c.t1 }}>
            {brief.runLabel}
          </h2>
          <StatusPill completed={completed} total={total} loading={isLoading || rerunning} theme={theme} />
          {lastScanAt && <FreshnessPill at={lastScanAt} theme={theme} />}
          {diff && diff.changes.length > 0 && (
            <DiffPill
              count={diff.changes.length}
              theme={theme}
              onClick={() => setDiffOpen((value) => !value)}
              active={diffOpen}
            />
          )}
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7, color: c.t2 }}>
          Snapshot the target, proposed transaction, financial context, key risks, and analyst follow-ups in one review surface.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        {sourceCount > 0 && <SourcePill count={sourceCount} theme={theme} />}
        {scanStarted && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRerun}
            disabled={refreshing}
            loading={rerunning}
            title="Re-run the deal brief"
          >
            {rerunning ? "Re-running…" : "Refresh scan"}
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={onOpenProactiveScan}>
          {scanStarted ? "Run again" : `Run ${brief.runLabel.toLowerCase()}`}
        </Button>
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        marginTop: 18,
      }}
    >
      <BriefStatCard
        label="Coverage"
        value={total > 0 ? `${completed}/${total}` : "0/0"}
        detail={total > 0 ? "Brief sections populated" : "No scan schema detected"}
        theme={theme}
      />
      <BriefStatCard
        label="Sources"
        value={sourceCount}
        detail="Cited inputs referenced"
        theme={theme}
      />
      <BriefStatCard
        label="Deal-breakers"
        value={dealBreakerCount}
        detail="Highest-severity findings"
        theme={theme}
        tone="alert"
      />
      <BriefStatCard
        label="Material"
        value={materialCount}
        detail="Items needing diligence"
        theme={theme}
      />
      <BriefStatCard
        label="Mismatches"
        value={inconsistencyCount}
        detail="Cross-document inconsistencies"
        theme={theme}
      />
    </div>
  </div>
  );
}
