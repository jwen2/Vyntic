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
import { ddTheme } from "@/components/dd/types";
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
  if (days <= 7) return { bg: "#fee2e2", fg: "#991b1b" };
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
  const c = ddTheme(theme);

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
    <div style={{ minHeight: "100vh", background: c.bg, color: c.t1 }}>
      <header className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: c.border }}>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => navigate("/app")}>← Funds</Button>
          <div>
            <div className="font-mono-plex" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: c.t3 }}>Portfolio</div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>Monitoring across all funds</h1>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleTheme}>{theme === "dark" ? "Light" : "Dark"}</Button>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 56px" }}>
        {/* Upcoming capital calls — hero panel */}
        <Panel c={c} title="Upcoming capital calls" subtitle="Sorted by due date. Red ≤7 days, amber ≤14 (calendar-day approximation).">
          {notices.isPending ? <Spinner c={c} /> : (notices.data ?? []).length === 0 ? (
            <Empty c={c}>No pending capital calls or distributions across your funds.</Empty>
          ) : (
            <Table c={c} head={["Due", "Days", "Fund", "Manager", "Kind", "Amount", "Purpose"]}>
              {(notices.data ?? []).map((n: PortfolioCallNotice) => {
                const days = daysUntil(n.due_date);
                const u = urgencyColor(days);
                return (
                  <tr key={n.id} onClick={() => navigate(`/deal/${n.deal_id}`)} style={{ cursor: "pointer" }}>
                    <Td c={c}>{n.due_date ?? "—"}</Td>
                    <Td c={c}><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: u.bg, color: u.fg }}>{days == null ? "—" : `${days}d`}</span></Td>
                    <Td c={c}>{n.fund_name}</Td>
                    <Td c={c} muted>{n.manager_name ?? "—"}</Td>
                    <Td c={c}>{n.kind}</Td>
                    <Td c={c} mono>{money(n.amount, n.currency)}</Td>
                    <Td c={c} muted>{n.purpose || "—"}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>

        {/* Commitments roll-up */}
        <Panel c={c} title="Commitments roll-up" subtitle="Committed, called, distributed, NAV and unfunded across funds.">
          {positions.isPending ? <Spinner c={c} /> : (positions.data ?? []).length === 0 ? (
            <Empty c={c}>No fund positions yet. Set commitments in each fund's Position panel.</Empty>
          ) : (
            <Table c={c} head={["Fund", "Manager", "Commitment", "Called", "Distributed", "NAV", "Unfunded"]}>
              {(positions.data ?? []).map((p) => (
                <tr key={p.deal_id} onClick={() => navigate(`/deal/${p.deal_id}`)} style={{ cursor: "pointer" }}>
                  <Td c={c}>{p.fund_name}</Td>
                  <Td c={c} muted>{p.manager_name ?? "—"}</Td>
                  <Td c={c} mono>{money(p.commitment_amount, p.currency)}</Td>
                  <Td c={c} mono>{money(p.called_amount, p.currency)}</Td>
                  <Td c={c} mono>{money(p.distributed_amount, p.currency)}</Td>
                  <Td c={c} mono>{money(p.nav, p.currency)}</Td>
                  <Td c={c} mono>{money(p.unfunded, p.currency)}</Td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <Td c={c}>Total</Td><Td c={c}></Td>
                <Td c={c} mono>{money(totals.commitment)}</Td>
                <Td c={c} mono>{money(totals.called)}</Td>
                <Td c={c} mono>{money(totals.distributed)}</Td>
                <Td c={c} mono>{money(totals.nav)}</Td>
                <Td c={c} mono>{money(totals.unfunded)}</Td>
              </tr>
            </Table>
          )}
        </Panel>

        {/* Compliance attention */}
        <Panel c={c} title="Compliance attention" subtitle="Side-letter obligations whose latest check is a breach or unclear.">
          {compliance.isPending ? <Spinner c={c} /> : (compliance.data ?? []).length === 0 ? (
            <Empty c={c}>No flagged obligations. Everything verified is compliant (or nothing verified yet).</Empty>
          ) : (
            <Table c={c} head={["Fund", "Manager", "Obligation", "Period", "Verdict"]}>
              {(compliance.data ?? []).map((o) => (
                <tr key={o.id} onClick={() => navigate(`/deal/${o.deal_id}`)} style={{ cursor: "pointer" }}>
                  <Td c={c}>{o.fund_name}</Td>
                  <Td c={c} muted>{o.manager_name ?? "—"}</Td>
                  <Td c={c}>{o.text}</Td>
                  <Td c={c}>{o.latest_check?.period ?? "—"}</Td>
                  <Td c={c}><span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: o.latest_check?.verdict === "breach" ? "#fee2e2" : "#fef9c3", color: o.latest_check?.verdict === "breach" ? "#991b1b" : "#854d0e" }}>{o.latest_check?.verdict ?? "—"}{o.latest_check?.confirmed ? "" : " (proposed)"}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

type C = ReturnType<typeof ddTheme>;
function Panel({ title, subtitle, children, c }: { title: string; subtitle: string; children: React.ReactNode; c: C }) {
  return (
    <section className="mb-5 rounded-[1.4rem] border p-5" style={{ borderColor: c.border, background: c.surface }}>
      <div className="font-mono-plex" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.t3 }}>{title}</div>
      <p style={{ margin: "4px 0 12px", fontSize: 13, color: c.t2 }}>{subtitle}</p>
      {children}
    </section>
  );
}
function Table({ head, children, c }: { head: string[]; children: React.ReactNode; c: C }) {
  return (
    <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ textAlign: "left", color: c.t3 }}>{head.map((h) => <th key={h} style={{ padding: "6px 8px", fontWeight: 600, borderBottom: `1px solid ${c.border}` }}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children, c, mono, muted }: { children?: React.ReactNode; c: C; mono?: boolean; muted?: boolean }) {
  return <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}`, color: muted ? c.t2 : c.t1, fontVariantNumeric: mono ? "tabular-nums" : undefined }}>{children}</td>;
}
function Empty({ children, c }: { children: React.ReactNode; c: C }) {
  return <div className="rounded-xl border border-dashed p-5 text-sm" style={{ borderColor: c.border, color: c.t3 }}>{children}</div>;
}
function Spinner({ c }: { c: C }) {
  return <div className="flex h-24 items-center justify-center"><div className="dd-spin h-7 w-7 rounded-full border-4" style={{ borderColor: c.border, borderTopColor: c.accent }} /></div>;
}
