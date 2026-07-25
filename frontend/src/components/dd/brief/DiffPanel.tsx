// "What changed since the last scan" panel. Extracted from
// DealBriefDashboard.tsx (FE5.4).

import Button from "@/components/ui/Button";
import { formatRelativeTime, type BriefDiffSnapshot, type FieldDiff } from "./diff";

export function DiffPanel({
  diff,
  onDismiss,
  onClose,
}: {
  diff: BriefDiffSnapshot;
  onDismiss: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="border border-edge bg-surface"
      style={{
        borderRadius: 24,
        padding: "16px",
      }}
    >
      <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
        <span className="text-t1" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Changes since {diff.previousAt ? formatRelativeTime(diff.previousAt) : "previous run"}
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="subtle" size="xs" onClick={onClose}>
          Hide
        </Button>
        <Button variant="subtle" size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
        {diff.changes.map((change, idx) => (
          <DiffRow key={`${change.panel}-${change.label}-${idx}`} change={change} />
        ))}
      </div>
    </div>
  );
}

export function DiffRow({ change }: { change: FieldDiff }) {
  const tone = change.kind === "added" ? "var(--status-good)" : change.kind === "removed" ? "var(--status-critical)" : "var(--status-warning)";
  return (
    <div
      className="border border-edge bg-surface-alt"
      style={{
        padding: "10px 12px",
        borderRadius: 18,
        minWidth: 0,
      }}
    >
      <div className="flex items-center" style={{ gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {change.kind}
        </span>
        <span className="text-t3" style={{ fontSize: 10 }}>{change.panelLabel}</span>
      </div>
      <div className="text-t1" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{change.label}</div>
      {change.kind !== "added" && (
        <div className="text-t2" style={{ fontSize: 11, lineHeight: 1.35, textDecoration: "line-through", overflowWrap: "anywhere" }}>{change.before}</div>
      )}
      {change.kind !== "removed" && (
        <div className="text-t1" style={{ fontSize: 11, lineHeight: 1.35, overflowWrap: "anywhere" }}>{change.after}</div>
      )}
    </div>
  );
}

export default DiffPanel;
