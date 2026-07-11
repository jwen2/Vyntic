import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { getPosition, upsertPosition, type Position } from "@/lib/api";
import { ddTheme } from "./types";

type FormState = {
  commitment_amount: string;
  currency: Position["currency"];
  called_amount: string;
  distributed_amount: string;
  nav: string;
  as_of: string;
  status: Position["status"];
};

const EMPTY_FORM: FormState = {
  commitment_amount: "",
  currency: "USD",
  called_amount: "",
  distributed_amount: "",
  nav: "",
  as_of: "",
  status: "active",
};

function formatNumber(value: number | null): string {
  if (value == null) return "";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 12 }).format(value);
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toForm(position: Position): FormState {
  return {
    commitment_amount: formatNumber(position.commitment_amount),
    currency: position.currency,
    called_amount: formatNumber(position.called_amount),
    distributed_amount: formatNumber(position.distributed_amount),
    nav: formatNumber(position.nav),
    as_of: position.as_of ?? "",
    status: position.status,
  };
}

interface PositionModalProps {
  dealId: string;
  dealName: string;
  isAdmin: boolean;
  theme: "light" | "dark";
  onClose: () => void;
}

export default function PositionModal({ dealId, dealName, isAdmin, theme, onClose }: PositionModalProps) {
  const c = ddTheme(theme);
  const isDark = theme === "dark";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPosition(dealId)
      .then((position) => { if (!cancelled) setForm(toForm(position)); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load position"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dealId]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const computed = useMemo(() => {
    const commitment = parseNumber(form.commitment_amount);
    const called = parseNumber(form.called_amount);
    const distributed = parseNumber(form.distributed_amount);
    const nav = parseNumber(form.nav);
    return {
      calledPct: commitment && called != null ? `${((called / commitment) * 100).toFixed(1)}%` : null,
      dpi: called && distributed != null && nav != null ? (distributed / called).toFixed(2) : null,
      tvpi: called && distributed != null && nav != null ? ((distributed + nav) / called).toFixed(2) : null,
    };
  }, [form]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const payload: Parameters<typeof upsertPosition>[1] = {
      currency: form.currency,
      status: form.status,
    };
    for (const key of ["commitment_amount", "called_amount", "distributed_amount", "nav"] as const) {
      const value = parseNumber(form[key]);
      if (value != null) payload[key] = value;
    }
    if (form.as_of.trim()) payload.as_of = form.as_of.trim();
    try {
      const position = await upsertPosition(dealId, payload);
      setForm(toForm(position));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save position");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { background: c.surfaceAlt, borderColor: c.border, color: c.t1 };
  return (
    <div onClick={onClose} className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,.58)" }}>
      <div onClick={(event) => event.stopPropagation()} className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] border shadow-2xl" style={{ background: c.surface, borderColor: c.border }} role="dialog" aria-modal="true" aria-label={`Position in ${dealName}`}>
        <div className="flex items-start justify-between border-b px-5 py-4" style={{ borderColor: c.border }}>
          <div><div className="font-mono-plex text-[9px] uppercase tracking-[0.16em]" style={{ color: c.t3 }}>LP position</div><h2 className="mt-1 text-lg font-semibold" style={{ color: c.t1 }}>{dealName}</h2><p className="mt-1 text-xs" style={{ color: c.t3 }}>{isAdmin ? "Track commitment and current fund values." : "Read-only position details."}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full border text-lg" style={{ borderColor: c.border, background: c.surfaceAlt, color: c.t2 }}>×</button>
        </div>

        {error && <div className="border-b px-5 py-3 text-sm" style={{ borderColor: isDark ? "#4b1919" : "#f0c2bd", background: isDark ? "#2a1212" : "#fff1f2", color: isDark ? "#fca5a5" : "#9a2e23" }}>{error}</div>}
        <div className="overflow-y-auto p-5 sm:p-6">
          {loading ? <div className="flex h-48 items-center justify-center"><div className="dd-spin h-8 w-8 rounded-full border-4" style={{ borderColor: c.border, borderTopColor: c.accent }} /></div> : <>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField label="Commitment" value={form.commitment_amount} readOnly={!isAdmin} style={inputStyle} onChange={(value) => setForm((prev) => ({ ...prev, commitment_amount: value }))} />
              <SelectField label="Currency" value={form.currency} disabled={!isAdmin} style={inputStyle} options={["USD", "EUR", "GBP"]} onChange={(value) => setForm((prev) => ({ ...prev, currency: value as Position["currency"] }))} />
              <MoneyField label="Called" value={form.called_amount} readOnly={!isAdmin} style={inputStyle} onChange={(value) => setForm((prev) => ({ ...prev, called_amount: value }))} />
              <MoneyField label="Distributed" value={form.distributed_amount} readOnly={!isAdmin} style={inputStyle} onChange={(value) => setForm((prev) => ({ ...prev, distributed_amount: value }))} />
              <MoneyField label="NAV" value={form.nav} readOnly={!isAdmin} style={inputStyle} onChange={(value) => setForm((prev) => ({ ...prev, nav: value }))} />
              <TextField label="As-of" placeholder="2026-Q2" value={form.as_of} readOnly={!isAdmin} style={inputStyle} onChange={(value) => setForm((prev) => ({ ...prev, as_of: value }))} />
              <SelectField label="Status" value={form.status} disabled={!isAdmin} style={inputStyle} options={["active", "pending", "exited"]} onChange={(value) => setForm((prev) => ({ ...prev, status: value as Position["status"] }))} />
            </div>

            {(computed.calledPct || computed.dpi || computed.tvpi) && <div className="mt-6 rounded-[1.25rem] border p-4" style={{ borderColor: c.accentTintBorder, background: c.accentTint }}><div className="font-mono-plex text-[9px] uppercase tracking-[0.14em]" style={{ color: c.t3 }}>Computed from entered values</div><div className="mt-3 grid grid-cols-3 gap-3">{computed.calledPct && <Metric label="Called" value={computed.calledPct} color={c.accentStrong} />}{computed.dpi && <Metric label="DPI" value={`${computed.dpi}x`} color={c.accentStrong} />}{computed.tvpi && <Metric label="TVPI" value={`${computed.tvpi}x`} color={c.accentStrong} />}</div></div>}
          </>}
        </div>

        {!loading && <div className="flex items-center justify-between border-t px-5 py-4" style={{ borderColor: c.border }}><span className="text-xs" style={{ color: saved ? c.accentStrong : c.t3 }}>{saved ? "Position saved" : isAdmin ? "Empty fields are left unchanged." : "Ask an admin to update this position."}</span>{isAdmin && <button type="button" onClick={handleSave} disabled={saving} className="rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: c.accent, color: c.onAccent }}>{saving ? "Saving…" : "Save position"}</button>}</div>}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) { return <span className="font-mono-plex text-[9px] uppercase tracking-[0.12em]">{children}</span>; }
type FieldStyle = { background: string; borderColor: string; color: string };
function MoneyField({ label, value, readOnly, style, onChange }: { label: string; value: string; readOnly: boolean; style: FieldStyle; onChange: (value: string) => void }) {
  return <label className="flex flex-col gap-2" style={{ color: style.color }}><Label>{label}</Label><input inputMode="decimal" value={value} readOnly={readOnly} onFocus={(event) => { if (!readOnly) onChange(event.currentTarget.value.replace(/,/g, "")); }} onBlur={(event) => { const parsed = parseNumber(event.currentTarget.value); onChange(parsed == null ? event.currentTarget.value : formatNumber(parsed)); }} onChange={(event) => onChange(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none read-only:opacity-70" style={style} /></label>;
}
function TextField({ label, value, placeholder, readOnly, style, onChange }: { label: string; value: string; placeholder: string; readOnly: boolean; style: FieldStyle; onChange: (value: string) => void }) { return <label className="flex flex-col gap-2" style={{ color: style.color }}><Label>{label}</Label><input value={value} placeholder={placeholder} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none read-only:opacity-70" style={style} /></label>; }
function SelectField({ label, value, options, disabled, style, onChange }: { label: string; value: string; options: string[]; disabled: boolean; style: FieldStyle; onChange: (value: string) => void }) { return <label className="flex flex-col gap-2" style={{ color: style.color }}><Label>{label}</Label><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="rounded-xl border px-3 py-2.5 text-sm outline-none disabled:opacity-70" style={style}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <div><div className="text-xs" style={{ color }}>{label}</div><div className="mt-1 text-xl font-semibold" style={{ color }}>{value}</div></div>; }
