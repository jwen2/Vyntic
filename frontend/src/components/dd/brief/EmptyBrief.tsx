// Pre-run empty state for the brief. Extracted from DealBriefDashboard.tsx (FE5.4).

import Button from "@/components/ui/Button";
import { type BriefEntityConfig } from "./config";

export function EmptyBrief({ onOpenProactiveScan, config }: { onOpenProactiveScan: () => void; config: BriefEntityConfig }) {
  const isFund = config.workflowId === "builtin_lp_fund_brief";
  const blurb = isFund
    ? "Run the fund brief to extract the fund snapshot, terms vs. market, track record, key risks, and analyst next steps from the manager's documents."
    : "Run the proactive scan to extract target profile, transaction terms, financial highlights, key risks, and analyst next steps from the current VDR.";
  return (
    <div
      className="border border-dashed border-edge bg-surface"
      style={{
        padding: "24px",
        borderRadius: 28,
      }}
    >
      <div
        className="font-mono-plex text-t3"
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        Ready to scan
      </div>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div style={{ maxWidth: 700 }}>
          <div className="text-t1" style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 600 }}>No {config.runLabel.toLowerCase()} yet</div>
          <div className="text-t2" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.7 }}>
            {blurb}
          </div>
        </div>

        <Button variant="primary" onClick={onOpenProactiveScan}>
          Run {config.runLabel.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

export default EmptyBrief;
