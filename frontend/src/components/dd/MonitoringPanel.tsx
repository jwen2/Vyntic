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
import { ddTheme } from "./types";

type Sub = "calls" | "sideletters";
type Verdict = "compliant" | "breach" | "unclear";

const VERDICT_COLOR: Record<Verdict, { bg: string; fg: string; label: string }> = {
  compliant: { bg: "#dcfce7", fg: "#166534", label: "Compliant" },
  breach: { bg: "#fee2e2", fg: "#991b1b", label: "Breach" },
  unclear: { bg: "#fef9c3", fg: "#854d0e", label: "Unclear" },
};

interface Props {
  dealId: string;
  dealName: string;
  isAdmin: boolean;
  theme: "light" | "dark";
}

export default function MonitoringPanel({ dealId, dealName, isAdmin, theme }: Props) {
  const c = ddTheme(theme);
  const [sub, setSub] = useState<Sub>("calls");
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);

  useEffect(() => {
    listDocuments(dealId).then(setDocuments).catch(() => setDocuments([]));
  }, [dealId]);

  return (
    <div style={{ background: c.bg, color: c.t1, height: "100%", overflowY: "auto" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" }}>
        <div className="font-mono-plex" style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: c.t3 }}>
          Monitoring · {dealName}
        </div>
        <h2 style={{ margin: "6px 0 4px", fontSize: 26, fontWeight: 600, color: c.t1 }}>
          Post-commitment tracking
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: c.t2 }}>
          Process capital calls and verify side-letter obligations against each quarterly package.
        </p>

        <div className="mt-5 flex gap-2">
          <SubTab label="Capital calls & distributions" active={sub === "calls"} onClick={() => setSub("calls")} c={c} />
          <SubTab label="Side letters" active={sub === "sideletters"} onClick={() => setSub("sideletters")} c={c} />
        </div>

        <div className="mt-5">
          {sub === "calls" ? (
            <CallsSection dealId={dealId} isAdmin={isAdmin} documents={documents} c={c} />
          ) : (
            <SideLettersSection dealId={dealId} isAdmin={isAdmin} documents={documents} c={c} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Capital calls ──

function CallsSection({ dealId, isAdmin, documents, c }: { dealId: string; isAdmin: boolean; documents: DocumentMetadata[]; c: ReturnType<typeof ddTheme> }) {
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
      {error && <Banner c={c}>{error}</Banner>}

      {isAdmin && (
        <Card c={c}>
          <SectionLabel c={c}>Process a notice</SectionLabel>
          <p style={{ margin: "4px 0 12px", fontSize: 13, color: c.t2 }}>
            Pick an uploaded capital-call or distribution notice. Vyntic extracts the amount, due date, and purpose with citations for you to confirm.
          </p>
          {candidateDocs.length === 0 ? (
            <Empty c={c}>No capital-call or distribution documents uploaded yet. Upload one and classify it in the documents panel.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {candidateDocs.map((d) => (
                <button key={d.doc_id} type="button" disabled={busy} onClick={() => handleExtract(d.doc_id)}
                  className="rounded-full border px-3 py-2 text-xs disabled:opacity-50"
                  style={{ borderColor: c.border, background: c.surfaceAlt, color: c.t1 }}>
                  {busy ? "Extracting…" : `Extract from ${d.filename}`}
                </button>
              ))}
            </div>
          )}

          {draft && (
            <div className="mt-4 rounded-[1rem] border p-4" style={{ borderColor: c.accentTintBorder, background: c.accentTint }}>
              <SectionLabel c={c}>Review extracted notice</SectionLabel>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Field label="Kind" c={c}><SelectMini value={draft.kind} options={["call", "distribution"]} onChange={(v) => setDraft({ ...draft, kind: v as CallNoticeDraft["kind"] })} c={c} /></Field>
                <Field label="Amount" c={c}><InputMini value={draft.amount?.toString() ?? ""} onChange={(v) => setDraft({ ...draft, amount: v ? Number(v.replace(/,/g, "")) : null })} c={c} /></Field>
                <Field label="Due date" c={c}><InputMini value={draft.due_date ?? ""} placeholder="2026-08-14" onChange={(v) => setDraft({ ...draft, due_date: v || null })} c={c} /></Field>
                <Field label="Period" c={c}><InputMini value={draft.period ?? ""} placeholder="2026-Q3" onChange={(v) => setDraft({ ...draft, period: v || null })} c={c} /></Field>
                <div className="sm:col-span-2"><Field label="Purpose" c={c}><InputMini value={draft.purpose} onChange={(v) => setDraft({ ...draft, purpose: v })} c={c} /></Field></div>
              </div>
              {draft.citations.filter(Boolean).length > 0 && (
                <div className="mt-2 text-[11px]" style={{ color: c.t3 }}>
                  {draft.citations.filter(Boolean).length} citation(s) — {draft.citations.filter(Boolean).map((ci) => ci && `${ci.source_file} p.${ci.page}`).join(", ")}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={handleConfirm} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: c.accent, color: c.onAccent }}>Confirm & add to queue</button>
                <button type="button" onClick={() => setDraft(null)} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: c.border, color: c.t2 }}>Discard</button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card c={c} className="mt-4">
        <SectionLabel c={c}>Queue</SectionLabel>
        {notices.length === 0 ? (
          <Empty c={c}>No notices processed yet.</Empty>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: c.t3, textAlign: "left" }}>
                  {["Due", "Kind", "Amount", "Purpose", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", fontWeight: 600, borderBottom: `1px solid ${c.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id} style={{ color: c.t1 }}>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}` }}>{n.due_date ?? "—"}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}` }}>{n.kind}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}`, fontVariantNumeric: "tabular-nums" }}>{n.amount != null ? `${n.currency} ${n.amount.toLocaleString()}` : "—"}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}`, color: c.t2 }}>{n.purpose || "—"}</td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}` }}><StatusPill status={n.status} c={c} /></td>
                    <td style={{ padding: "8px", borderBottom: `1px solid ${c.border}` }}>
                      {isAdmin && n.status !== "paid" && n.status !== "dismissed" && (
                        <span className="flex gap-1">
                          <MiniBtn onClick={() => setStatus(n.id, "paid")} c={c}>Mark paid</MiniBtn>
                          <MiniBtn onClick={() => setStatus(n.id, "dismissed")} c={c}>Dismiss</MiniBtn>
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

function SideLettersSection({ dealId, isAdmin, documents, c }: { dealId: string; isAdmin: boolean; documents: DocumentMetadata[]; c: ReturnType<typeof ddTheme> }) {
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
      {error && <Banner c={c}>{error}</Banner>}

      {isAdmin && (
        <Card c={c}>
          <SectionLabel c={c}>Extract obligations from a side letter</SectionLabel>
          {slDocs.length === 0 ? (
            <Empty c={c}>No side-letter documents uploaded yet.</Empty>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {slDocs.map((d) => (
                <button key={d.doc_id} type="button" disabled={busy} onClick={() => handleExtract(d.doc_id)}
                  className="rounded-full border px-3 py-2 text-xs disabled:opacity-50" style={{ borderColor: c.border, background: c.surfaceAlt, color: c.t1 }}>
                  {busy ? "Working…" : `Extract from ${d.filename}`}
                </button>
              ))}
            </div>
          )}

          {drafts && (
            <div className="mt-4 rounded-[1rem] border p-4" style={{ borderColor: c.accentTintBorder, background: c.accentTint }}>
              <SectionLabel c={c}>Review {drafts.length} obligation(s) before saving</SectionLabel>
              <ul className="mt-2 space-y-2">
                {drafts.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: c.t1 }}>
                    <span className="rounded px-1.5 py-0.5 text-[10px] uppercase" style={{ background: c.surfaceAlt, color: c.t3 }}>{o.category}</span>
                    <span>{o.text}</span>
                    <button type="button" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} className="ml-auto text-xs" style={{ color: c.t3 }}>remove</button>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={handleSaveDrafts} disabled={busy || drafts.length === 0} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: c.accent, color: c.onAccent }}>Save obligations</button>
                <button type="button" onClick={() => setDrafts(null)} className="rounded-full border px-4 py-2 text-sm" style={{ borderColor: c.border, color: c.t2 }}>Cancel</button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card c={c} className="mt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionLabel c={c}>Obligations & compliance</SectionLabel>
          {isAdmin && obligations.length > 0 && (
            <div className="flex items-center gap-2">
              <InputMini value={period} placeholder="2026-Q2" onChange={setPeriod} c={c} />
              <button type="button" onClick={handleVerify} disabled={busy} className="rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-60" style={{ background: c.accent, color: c.onAccent }}>
                {busy ? "Verifying…" : "Verify against period"}
              </button>
            </div>
          )}
        </div>
        {obligations.length === 0 ? (
          <Empty c={c}>No obligations tracked yet. Extract them from a side letter above.</Empty>
        ) : (
          <ul className="mt-3 space-y-3">
            {obligations.map((o) => (
              <li key={o.id} className="rounded-[0.9rem] border p-3" style={{ borderColor: c.border, background: c.surface }}>
                <div className="flex items-start gap-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] uppercase" style={{ background: c.surfaceAlt, color: c.t3 }}>{o.category}</span>
                  <span style={{ fontSize: 14, color: c.t1 }}>{o.text}</span>
                  {o.latest_check && <span className="ml-auto"><VerdictPill verdict={o.latest_check.verdict} confirmed={o.latest_check.confirmed} /></span>}
                </div>
                {o.verify_hint && <div className="mt-1 text-xs" style={{ color: c.t3 }}>Check: {o.verify_hint}</div>}
                {o.latest_check && (
                  <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: c.surfaceAlt, color: c.t2 }}>
                    <div><strong style={{ color: c.t1 }}>{o.latest_check.period}</strong> — {o.latest_check.rationale || "No rationale"}</div>
                    {isAdmin && !o.latest_check.confirmed && (
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <span style={{ color: c.t3 }}>Model proposed {o.latest_check.verdict}. Confirm or override:</span>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id)} c={c}>Accept</MiniBtn>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id, "compliant")} c={c}>Compliant</MiniBtn>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id, "breach")} c={c}>Breach</MiniBtn>
                        <MiniBtn onClick={() => handleConfirm(o.latest_check!.id, "unclear")} c={c}>Unclear</MiniBtn>
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
function StatusPill({ status, c }: { status: string; c: ReturnType<typeof ddTheme> }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: c.surfaceAlt, color: c.t2 }}>{status}</span>;
}
function SubTab({ label, active, onClick, c }: { label: string; active: boolean; onClick: () => void; c: ReturnType<typeof ddTheme> }) {
  return <button type="button" onClick={onClick} className="rounded-full px-4 py-2 text-sm font-medium" style={{ background: active ? c.accent : c.surfaceAlt, color: active ? c.onAccent : c.t2, border: `1px solid ${active ? c.accent : c.border}` }}>{label}</button>;
}
function Card({ children, c, className }: { children: React.ReactNode; c: ReturnType<typeof ddTheme>; className?: string }) {
  return <div className={className} style={{ borderRadius: 20, border: `1px solid ${c.border}`, background: c.surface, padding: 18 }}>{children}</div>;
}
function SectionLabel({ children, c }: { children: React.ReactNode; c: ReturnType<typeof ddTheme> }) {
  return <div className="font-mono-plex" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: c.t3 }}>{children}</div>;
}
function Empty({ children, c }: { children: React.ReactNode; c: ReturnType<typeof ddTheme> }) {
  return <div className="mt-2 rounded-xl border border-dashed p-4 text-sm" style={{ borderColor: c.border, color: c.t3 }}>{children}</div>;
}
function Banner({ children, c }: { children: React.ReactNode; c: ReturnType<typeof ddTheme> }) {
  return <div className="mb-3 rounded-xl px-3 py-2 text-sm" style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>{children}</div>;
}
function Field({ label, children, c }: { label: string; children: React.ReactNode; c: ReturnType<typeof ddTheme> }) {
  return <label className="flex flex-col gap-1"><span className="font-mono-plex text-[9px] uppercase tracking-[0.12em]" style={{ color: c.t3 }}>{label}</span>{children}</label>;
}
function InputMini({ value, onChange, placeholder, c }: { value: string; onChange: (v: string) => void; placeholder?: string; c: ReturnType<typeof ddTheme> }) {
  return <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-sm outline-none" style={{ background: c.surfaceAlt, borderColor: c.border, color: c.t1 }} />;
}
function SelectMini({ value, options, onChange, c }: { value: string; options: string[]; onChange: (v: string) => void; c: ReturnType<typeof ddTheme> }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border px-2.5 py-1.5 text-sm outline-none" style={{ background: c.surfaceAlt, borderColor: c.border, color: c.t1 }}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}
function MiniBtn({ children, onClick, c }: { children: React.ReactNode; onClick: () => void; c: ReturnType<typeof ddTheme> }) {
  return <button type="button" onClick={onClick} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: c.border, background: c.surfaceAlt, color: c.t1 }}>{children}</button>;
}
