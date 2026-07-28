import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmCheck,
  createCallNotice,
  createObligations,
  extractCallNotice,
  extractObligations,
  listCallNotices,
  listDocuments,
  listObligations,
  updateCallNotice,
  verifySideLetters,
  type CallNotice,
  type CallNoticeDraft,
  type DocumentMetadata,
  type Obligation,
  type ObligationDraft,
} from "@/lib/api";
import Button from "@/components/ui/Button";
import Input, { Select } from "@/components/ui/Input";
import SectionLabel from "@/components/ui/SectionLabel";

type Sub = "calls" | "sideletters";
type Verdict = "compliant" | "breach" | "unclear";

const VERDICT_COLOR: Record<Verdict, { bg: string; fg: string; label: string }> = {
  compliant: { bg: "#dcfce7", fg: "#166534", label: "Compliant" },
  breach: { bg: "var(--status-critical-tint)", fg: "var(--status-critical)", label: "Breach" },
  unclear: { bg: "#fef9c3", fg: "#854d0e", label: "Unclear" },
};

interface Props {
  dealId: string;
  dealName: string;
  isAdmin: boolean;
}

export default function MonitoringPanel({ dealId, dealName, isAdmin }: Props) {
  const [sub, setSub] = useState<Sub>("calls");
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);

  useEffect(() => {
    listDocuments(dealId).then(setDocuments).catch(() => setDocuments([]));
  }, [dealId]);

  return (
    <div className="bg-appbg text-t1" style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" }}>
        <div className="font-mono-plex text-t3" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Monitoring · {dealName}
        </div>
        <h2 className="text-t1" style={{ margin: "6px 0 4px", font: "var(--text-h2)" }}>
          Post-commitment tracking
        </h2>
        <p className="text-t2" style={{ margin: 0, font: "var(--text-body)" }}>
          Process capital calls and verify side-letter obligations against each quarterly package.
        </p>

        <div className="mt-5 flex gap-2">
          <SubTab label="Capital calls & distributions" active={sub === "calls"} onClick={() => setSub("calls")} />
          <SubTab label="Side letters" active={sub === "sideletters"} onClick={() => setSub("sideletters")} />
        </div>

        <div className="mt-5">
          {sub === "calls" ? (
            <CallsSection dealId={dealId} isAdmin={isAdmin} documents={documents} />
          ) : (
            <SideLettersSection dealId={dealId} isAdmin={isAdmin} documents={documents} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Capital calls ──

function CallsSection({ dealId, isAdmin, documents }: { dealId: string; isAdmin: boolean; documents: DocumentMetadata[] }) {
  const [notices, setNotices] = useState<CallNotice[]>([]);
  const [draft, setDraft] = useState<CallNoticeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listCallNotices(dealId).then(setNotices).catch((e) => setError(String(e)));
  }, [dealId]);
  useEffect(refresh, [refresh]);

  const candidateDocs = useMemo(
    () => documents.filter((d) => ["capital_call", "distribution_notice", "other"].includes(d.doc_category ?? "other")),
    [documents]
  );

  async function handleExtract(docId: string) {
    setBusy(true);
    setError(null);
    try {
      setDraft(await extractCallNotice(dealId, docId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!draft) return;
    setBusy(true);
    try {
      await createCallNotice(dealId, draft);
      setDraft(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: CallNotice["status"]) {
    await updateCallNotice(dealId, id, { status });
    refresh();
  }

  return (
    <div>
      {error && <Banner>{error}</Banner>}

      {isAdmin && (
        <Card>
          <SectionLabel variant="mono">Process a notice</SectionLabel>
          <p className="text-t2" style={{ margin: "4px 0 12px", fontSize: 13 }}>
            Pick an uploaded capital-call or distribution notice. Vyntic extracts the amount, due date, and purpose with citations for you to confirm.
          </p>
          {candidateDocs.length === 0 ? (
            <Empty>No capital-call or distribution documents uploaded yet. Upload one and classify it in the documents panel.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidateDocs.map((d) => (
                <Button key={d.doc_id} variant="secondary" size="sm" loading={busy} onClick={() => handleExtract(d.doc_id)}>
                  {busy ? "Extracting…" : `Extract from ${d.filename}`}
                </Button>
              ))}
            </div>
          )}

          {draft && (
            <div className="mt-4 rounded-[1rem] border border-accent-tint-border bg-accent-tint p-4">
              <SectionLabel variant="mono">Review extracted notice</SectionLabel>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label="Kind"><SelectMini value={draft.kind} options={["call", "distribution"]} onChange={(v) => setDraft({ ...draft, kind: v as CallNoticeDraft["kind"] })} /></Field>
                <Field label="Amount"><InputMini value={draft.amount?.toString() ?? ""} onChange={(v) => setDraft({ ...draft, amount: v ? Number(v.replace(/,/g, "")) : null })} /></Field>
                <Field label="Due date"><InputMini value={draft.due_date ?? ""} placeholder="2026-08-14" onChange={(v) => setDraft({ ...draft, due_date: v || null })} /></Field>
                <Field label="Period"><InputMini value={draft.period ?? ""} placeholder="2026-Q3" onChange={(v) => setDraft({ ...draft, period: v || null })} /></Field>
                <div className="sm:col-span-2"><Field label="Purpose"><InputMini value={draft.purpose} onChange={(v) => setDraft({ ...draft, purpose: v })} /></Field></div>
              </div>
              {draft.citations.filter(Boolean).length > 0 && (
                <div className="mt-2 text-[11px] text-t3">
                  {draft.citations.filter(Boolean).length} citation(s) — {draft.citations.filter(Boolean).map((ci) => ci && `${ci.source_file} p.${ci.page}`).join(", ")}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" loading={busy} onClick={handleConfirm}>Confirm &amp; add to queue</Button>
                <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>Discard</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <SectionLabel variant="mono">Queue</SectionLabel>
        {notices.length === 0 ? (
          <Empty>No notices processed yet.</Empty>
        ) : (
          <div className="data-table-wrap mt-2">
            <table className="data-table data-table--dense">
              <thead>
                <tr>
                  {["Due", "Kind", "Amount", "Purpose", "Status", ""].map((h) => (
                    <th key={h} className={h === "Amount" ? "data-table__num" : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id}>
                    <td>{n.due_date ?? "—"}</td>
                    <td>{n.kind}</td>
                    <td className="data-table__num">{n.amount != null ? `${n.currency} ${n.amount.toLocaleString()}` : "—"}</td>
                    <td className="data-table__muted">{n.purpose || "—"}</td>
                    <td><StatusPill status={n.status} /></td>
                    <td>
                      {isAdmin && n.status !== "paid" && n.status !== "dismissed" && (
                        <span className="flex gap-1">
                          <MiniBtn onClick={() => setStatus(n.id, "paid")}>Mark paid</MiniBtn>
                          <MiniBtn onClick={() => setStatus(n.id, "dismissed")}>Dismiss</MiniBtn>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Side letters ──

function SideLettersSection({ dealId, isAdmin, documents }: { dealId: string; isAdmin: boolean; documents: DocumentMetadata[] }) {
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [drafts, setDrafts] = useState<ObligationDraft[] | null>(null);
  const [draftDocId, setDraftDocId] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listObligations(dealId).then(setObligations).catch((e) => setError(String(e)));
  }, [dealId]);
  useEffect(refresh, [refresh]);

  const slDocs = useMemo(
    () => documents.filter((d) => ["side_letter", "other"].includes(d.doc_category ?? "other")),
    [documents]
  );

  async function handleExtract(docId: string) {
    setBusy(true); setError(null);
    try {
      setDrafts(await extractObligations(dealId, docId));
      setDraftDocId(docId);
    } catch (e) { setError(e instanceof Error ? e.message : "Extraction failed"); }
    finally { setBusy(false); }
  }

  async function handleSaveDrafts() {
    if (!drafts) return;
    setBusy(true);
    try { await createObligations(dealId, draftDocId, drafts); setDrafts(null); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  }

  async function handleVerify() {
    if (!period.trim()) { setError("Enter a period like 2026-Q2"); return; }
    setBusy(true); setError(null);
    try { await verifySideLetters(dealId, period.trim()); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Verification failed"); }
    finally { setBusy(false); }
  }

  async function handleConfirm(checkId: string, verdict?: string) {
    await confirmCheck(dealId, checkId, verdict ? { verdict } : {});
    refresh();
  }

  return (
    <div>
      {error && <Banner>{error}</Banner>}

      {isAdmin && (
        <Card>
          <SectionLabel variant="mono">Extract obligations from a side letter</SectionLabel>
          {slDocs.length === 0 ? (
            <Empty>No side-letter documents uploaded yet.</Empty>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {slDocs.map((d) => (
                <Button key={d.doc_id} variant="secondary" size="sm" loading={busy} onClick={() => handleExtract(d.doc_id)}>
                  {busy ? "Working…" : `Extract from ${d.filename}`}
                </Button>
              ))}
            </div>
          )}

          {drafts && (
            <div className="mt-4 rounded-[1rem] border border-accent-tint-border bg-accent-tint p-4">
              <SectionLabel variant="mono">Review {drafts.length} obligation(s) before saving</SectionLabel>
              <ul className="mt-2 space-y-2">
                {drafts.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-t1">
                    <span className="rounded px-1.5 py-0.5 text-[10px] uppercase bg-surface-alt text-t3">{o.category}</span>
                    <span>{o.text}</span>
                    <Button variant="subtle" size="xs" className="ml-auto" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>remove</Button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" loading={busy} disabled={drafts.length === 0} onClick={handleSaveDrafts}>Save obligations</Button>
                <Button variant="secondary" size="sm" onClick={() => setDrafts(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionLabel variant="mono">Obligations & compliance</SectionLabel>
          {isAdmin && obligations.length > 0 && (
            <div className="flex items-center gap-2">
              <InputMini value={period} placeholder="2026-Q2" onChange={setPeriod} />
              <Button variant="primary" size="sm" loading={busy} onClick={handleVerify}>
                {busy ? "Verifying…" : "Verify against period"}
              </Button>
            </div>
          )}
        </div>
        {obligations.length === 0 ? (
          <Empty>No obligations tracked yet. Extract them from a side letter above.</Empty>
        ) : (
          <ul className="mt-3 space-y-3">
            {obligations.map((o) => (
              <li key={o.id} className="rounded-[0.9rem] border border-edge bg-surface p-3">
                <div className="flex items-start gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] uppercase bg-surface-alt text-t3">{o.category}</span>
                  <span className="text-t1" style={{ fontSize: 14 }}>{o.text}</span>
                  {o.latest_check && <span className="ml-auto"><VerdictPill verdict={o.latest_check.verdict} confirmed={o.latest_check.confirmed} /></span>}
                </div>
                {o.verify_hint && <div className="mt-1 text-xs text-t3">Check: {o.verify_hint}</div>}
                {o.latest_check && (
                  <div className="mt-2 rounded-lg p-2 text-xs bg-surface-alt text-t2">
                    <div><strong className="text-t1">{o.latest_check.period}</strong> — {o.latest_check.rationale || "No rationale"}</div>
                    {isAdmin && !o.latest_check.confirmed && (
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <span className="text-t3">Model proposed {o.latest_check.verdict}. Confirm or override:</span>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id)}>Accept</MiniBtn>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id, "compliant")}>Compliant</MiniBtn>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id, "breach")}>Breach</MiniBtn>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id, "unclear")}>Unclear</MiniBtn>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ── shared bits ──

function VerdictPill({ verdict, confirmed }: { verdict: Verdict; confirmed: boolean }) {
  const v = VERDICT_COLOR[verdict];
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: v.bg, color: v.fg }}>{v.label}{confirmed ? "" : " (proposed)"}</span>;
}
function StatusPill({ status }: { status: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] bg-surface-alt text-t2">{status}</span>;
}
function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium border ${
        active ? "bg-accent text-on-accent border-accent" : "bg-surface-alt text-t2 border-edge"
      }`}
    >
      {label}
    </button>
  );
}
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[20px] border border-edge bg-surface p-[18px] ${className ?? ""}`}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 rounded-xl border border-dashed border-edge p-4 text-sm text-t3">{children}</div>;
}
function Banner({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--danger-tint)", color: "var(--danger)", border: "1px solid var(--danger-tint-border)" }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="font-mono-plex text-[9px] uppercase tracking-[0.12em] text-t3">{label}</span>{children}</label>;
}
function InputMini({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} fieldSize="sm" fullWidth />;
}
function SelectMini({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return <Select value={value} onChange={(e) => onChange(e.target.value)} fieldSize="sm" fullWidth>{options.map((o) => <option key={o} value={o}>{o}</option>)}</Select>;
}
function MiniBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <Button variant="secondary" size="xs" onClick={onClick}>{children}</Button>;
}
