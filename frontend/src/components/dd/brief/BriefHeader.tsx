// The brief's header card: title, run status pills, actions, and the
// coverage/severity stat row. Extracted from DealBriefDashboard.tsx (FE5.4)
// so the shell holds only hook wiring, derived state, and panel composition.

import type { Dispatch, SetStateAction } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
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
  return (
  <Card level="hero">
    <div
      className="font-mono-plex text-t3"
      style={{
        fontSize: 10,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
      }}
    >
      Automated brief
    </div>

    <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div style={{ maxWidth: 760 }}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-t1" style={{ margin: 0, fontSize: 30, lineHeight: 1.05, fontWeight: 600 }}>
            {brief.runLabel}
          </h2>
          <StatusPill completed={completed} total={total} loading={isLoading || rerunning} theme={theme} />
          {lastScanAt && <FreshnessPill at={lastScanAt} />}
          {diff && diff.changes.length > 0 && (
            <DiffPill
              count={diff.changes.length}
              onClick={() => setDiffOpen((value) => !value)}
              active={diffOpen}
            />
          )}
        </div>
        <p className="text-t2" style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.7 }}>
          Snapshot the target, proposed transaction, financial context, key risks, and analyst follow-ups in one review surface.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        {sourceCount > 0 && <SourcePill count={sourceCount} />}
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
      />
      <BriefStatCard
        label="Sources"
        value={sourceCount}
        detail="Cited inputs referenced"
      />
      <BriefStatCard
        label="Deal-breakers"
        value={dealBreakerCount}
        detail="Highest-severity findings"
        tone="alert"
      />
      <BriefStatCard
        label="Material"
        value={materialCount}
        detail="Items needing diligence"
      />
      <BriefStatCard
        label="Mismatches"
        value={inconsistencyCount}
        detail="Cross-document inconsistencies"
      />
    </div>
  </Card>
  );
}
