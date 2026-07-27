import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  getPortfolioCallNotices,
  getPortfolioCompliance,
  getPortfolioPositions,
  type PortfolioCallNotice,
} from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import Button from "@/components/ui/Button";

// Calendar-day approximation of the wire window (business-day math deferred).
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso + "T00:00:00");
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000);
}

function urgencyColor(days: number | null): { bg: string; fg: string } {
  if (days == null) return { bg: "#e5e7eb", fg: "#374151" };
  if (days <= 7) return { bg: "var(--status-critical-tint)", fg: "var(--status-critical)" };
  if (days <= 14) return { bg: "#fef3c7", fg: "#92400e" };
  return { bg: "#e0f2fe", fg: "#075985" };
}

function money(v: number | null, currency = "USD"): string {
  if (v == null) return "—";
  return `${currency} ${v.toLocaleString()}`;
}

export default function PortfolioPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const notices = useQuery({ queryKey: ["portfolio", "call-notices"], queryFn: getPortfolioCallNotices });
  const positions = useQuery({ queryKey: ["portfolio", "positions"], queryFn: getPortfolioPositions });
  const compliance = useQuery({ queryKey: ["portfolio", "compliance"], queryFn: getPortfolioCompliance });

  const totals = useMemo(() => {
    const rows = positions.data ?? [];
    const sum = (k: "commitment_amount" | "called_amount" | "distributed_amount" | "nav" | "unfunded") =>
      rows.reduce((acc, r) => acc + (r[k] ?? 0), 0);
    return { commitment: sum("commitment_amount"), called: sum("called_amount"), distributed: sum("distributed_amount"), nav: sum("nav"), unfunded: sum("unfunded") };
  }, [positions.data]);

  return (
    <div className="bg-appbg text-t1" style={{ minHeight: "100vh" }}>
      <header className="flex items-center justify-between border-b border-b-edge px-5 py-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => navigate("/app")}>← Funds</Button>
          <div>
            <div className="font-mono-plex text-t3" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>Portfolio</div>
            <h1 style={{ font: "var(--text-h3)" }}>Monitoring across all funds</h1>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleTheme}>{theme === "dark" ? "Light" : "Dark"}</Button>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 56px" }}>
        {/* Upcoming capital calls — hero panel */}
        <Panel title="Upcoming capital calls" subtitle="Sorted by due date. Red ≤7 days, amber ≤14 (calendar-day approximation).">
          {notices.isPending ? <Spinner /> : (notices.data ?? []).length === 0 ? (
            <Empty>No pending capital calls or distributions across your funds.</Empty>
          ) : (
            <Table head={["Due", "Days", "Fund", "Manager", "Kind", "Amount", "Purpose"]}>
              {(notices.data ?? []).map((n: PortfolioCallNotice) => {
                const days = daysUntil(n.due_date);
                const u = urgencyColor(days);
                return (
                  <tr key={n.id} onClick={() => navigate(`/deal/${n.deal_id}`)} style={{ cursor: "pointer" }}>
                    <Td>{n.due_date ?? "—"}</Td>
                    <Td><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: u.bg, color: u.fg }}>{days == null ? "—" : `${days}d`}</span></Td>
                    <Td>{n.fund_name}</Td>
                    <Td muted>{n.manager_name ?? "—"}</Td>
                    <Td>{n.kind}</Td>
                    <Td mono>{money(n.amount, n.currency)}</Td>
                    <Td muted>{n.purpose || "—"}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>

        {/* Commitments roll-up */}
        <Panel title="Commitments roll-up" subtitle="Committed, called, distributed, NAV and unfunded across funds.">
          {positions.isPending ? <Spinner /> : (positions.data ?? []).length === 0 ? (
            <Empty>No fund positions yet. Set commitments in each fund's Position panel.</Empty>
          ) : (
            <Table head={["Fund", "Manager", "Commitment", "Called", "Distributed", "NAV", "Unfunded"]}>
              {(positions.data ?? []).map((p) => (
                <tr key={p.deal_id} onClick={() => navigate(`/deal/${p.deal_id}`)} style={{ cursor: "pointer" }}>
                  <Td>{p.fund_name}</Td>
                  <Td muted>{p.manager_name ?? "—"}</Td>
                  <Td mono>{money(p.commitment_amount, p.currency)}</Td>
                  <Td mono>{money(p.called_amount, p.currency)}</Td>
                  <Td mono>{money(p.distributed_amount, p.currency)}</Td>
                  <Td mono>{money(p.nav, p.currency)}</Td>
                  <Td mono>{money(p.unfunded, p.currency)}</Td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <Td>Total</Td><Td></Td>
                <Td mono>{money(totals.commitment)}</Td>
                <Td mono>{money(totals.called)}</Td>
                <Td mono>{money(totals.distributed)}</Td>
                <Td mono>{money(totals.nav)}</Td>
                <Td mono>{money(totals.unfunded)}</Td>
              </tr>
            </Table>
          )}
        </Panel>

        {/* Compliance attention */}
        <Panel title="Compliance attention" subtitle="Side-letter obligations whose latest check is a breach or unclear.">
          {compliance.isPending ? <Spinner /> : (compliance.data ?? []).length === 0 ? (
            <Empty>No flagged obligations. Everything verified is compliant (or nothing verified yet).</Empty>
          ) : (
            <Table head={["Fund", "Manager", "Obligation", "Period", "Verdict"]}>
              {(compliance.data ?? []).map((o) => (
                <tr key={o.id} onClick={() => navigate(`/deal/${o.deal_id}`)} style={{ cursor: "pointer" }}>
                  <Td>{o.fund_name}</Td>
                  <Td muted>{o.manager_name ?? "—"}</Td>
                  <Td>{o.text}</Td>
                  <Td>{o.latest_check?.period ?? "—"}</Td>
                  <Td><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: o.latest_check?.verdict === "breach" ? "var(--status-critical-tint)" : "#fef9c3", color: o.latest_check?.verdict === "breach" ? "var(--status-critical)" : "#854d0e" }}>{o.latest_check?.verdict ?? "—"}{o.latest_check?.confirmed ? "" : " (proposed)"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded-[1.4rem] border border-edge bg-surface p-5">
      <div className="font-mono-plex text-t3" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>{title}</div>
      <p className="text-t2" style={{ margin: "4px 0 12px", font: "var(--text-sm)" }}>{subtitle}</p>
      {children}
    </section>
  );
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr className="text-t3" style={{ textAlign: "left" }}>{head.map((h) => <th key={h} className="border-b border-b-edge" style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, mono, muted }: { children?: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return <td className={`border-b border-b-edge ${muted ? "text-t2" : "text-t1"}`} style={{ padding: "8px", fontVariantNumeric: mono ? "tabular-nums" : undefined }}>{children}</td>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-edge p-5 text-sm text-t3">{children}</div>;
}
function Spinner() {
  return <div className="flex h-24 items-center justify-center"><div className="dd-spin h-7 w-7 rounded-full border-4 border-edge" style={{ borderTopColor: "var(--accent)" }} /></div>;
}
