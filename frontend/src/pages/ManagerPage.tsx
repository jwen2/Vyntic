import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  DOC_CATEGORY_LABELS,
  getManager,
  listManagerDocuments,
  listManagerFunds,
} from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import { ddTheme } from "@/components/dd/types";
import { stageBadge } from "@/lib/stageBadges";

export default function ManagerPage() {
  const { managerId: managerIdParam } = useParams<{ managerId: string }>();
  const managerId = managerIdParam ?? "";
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const c = ddTheme(theme);
  const isDark = theme === "dark";

  const managerQuery = useQuery({
    queryKey: ["manager", managerId],
    queryFn: () => getManager(managerId),
    enabled: !!managerId,
  });
  const fundsQuery = useQuery({
    queryKey: ["manager", managerId, "funds"],
    queryFn: () => listManagerFunds(managerId),
    enabled: !!managerId,
  });
  const documentsQuery = useQuery({
    queryKey: ["manager", managerId, "documents"],
    queryFn: () => listManagerDocuments(managerId),
    enabled: !!managerId,
    retry: (count, error) => !(error instanceof ApiError && error.status === 403) && count < 2,
  });

  const funds = useMemo(() => fundsQuery.data ?? [], [fundsQuery.data]);
  const fundNames = useMemo(
    () => new Map(funds.map((fund) => [fund.deal_id, fund.name])),
    [funds],
  );
  const documentsForbidden = documentsQuery.error instanceof ApiError && documentsQuery.error.status === 403;
  const loading = managerQuery.isPending || fundsQuery.isPending;

  if (!managerIdParam) return null;
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center" style={{ background: c.bg }}><div className="dd-spin h-8 w-8 rounded-full border-4" style={{ borderColor: c.border, borderTopColor: c.accent }} /></div>;
  }
  if (!managerQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6" style={{ background: c.bg, color: c.t1 }}>
        <div className="text-center"><h1 className="text-xl font-semibold">Manager not found</h1><p className="mt-2 text-sm" style={{ color: c.t2 }}>{managerQuery.error instanceof Error ? managerQuery.error.message : "This manager is unavailable."}</p><button className="mt-5 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: c.accent, color: c.onAccent }} onClick={() => navigate("/app")}>All funds</button></div>
      </div>
    );
  }

  const manager = managerQuery.data;
  return (
    <div className="min-h-screen" style={{ background: c.bg, color: c.t1, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <header className="border-b px-5 py-4 sm:px-8" style={{ background: c.surface, borderColor: c.border }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <button type="button" onClick={() => navigate("/app")} className="rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: c.border, background: c.surfaceAlt, color: c.t1 }}>← All funds</button>
          <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: c.border, background: c.surfaceAlt, color: c.t1 }}>{isDark ? "☀" : "☾"}</button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="rounded-[2rem] border p-6 sm:p-8" style={{ borderColor: c.border, background: c.surface }}>
          <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em]" style={{ color: c.t3 }}>Fund manager</div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold sm:text-4xl">{manager.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6" style={{ color: c.t2 }}>{manager.description || "No manager description has been added yet."}</p>
            </div>
            <div className="rounded-full border px-4 py-3 text-center" style={{ borderColor: c.accentTintBorder, background: c.accentTint }}>
              <div className="font-mono-plex text-[9px] uppercase tracking-[0.14em]" style={{ color: c.t3 }}>Funds</div>
              <div className="mt-1 text-xl font-semibold" style={{ color: c.accentStrong }}>{manager.fund_count}</div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between"><div><div className="font-mono-plex text-[10px] uppercase tracking-[0.18em]" style={{ color: c.t3 }}>Portfolio</div><h2 className="mt-2 text-2xl font-semibold">Funds</h2></div><span className="text-sm" style={{ color: c.t2 }}>{funds.length} visible</span></div>
          {fundsQuery.error ? <ErrorCard message={fundsQuery.error instanceof Error ? fundsQuery.error.message : "Could not load funds."} theme={theme} /> : funds.length === 0 ? <EmptyCard text="No accessible funds are linked to this manager." theme={theme} /> : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {funds.map((fund) => {
                const badge = stageBadge(fund.stage, isDark);
                return <button key={fund.deal_id} type="button" onClick={() => navigate(`/deal/${encodeURIComponent(fund.deal_id)}`)} className="rounded-[1.5rem] border p-5 text-left transition-transform hover:-translate-y-0.5" style={{ borderColor: c.border, background: c.surface, color: c.t1 }}><div className="flex items-start justify-between gap-3"><div><div className="font-mono-plex text-[9px] uppercase tracking-[0.14em]" style={{ color: c.t3 }}>{fund.vintage ?? "Vintage —"}</div><h3 className="mt-2 text-lg font-semibold">{fund.name}</h3></div><span className="rounded-full border px-2.5 py-1 font-mono-plex text-[9px] uppercase tracking-[0.1em]" style={{ background: badge?.bg ?? c.surfaceAlt, borderColor: badge?.border ?? c.border, color: badge?.fg ?? c.t2 }}>{fund.stage}</span></div><div className="mt-6 flex items-center justify-between text-sm" style={{ color: c.t2 }}><span>{fund.strategy || "Strategy not set"}</span><span>{fund.document_count} docs →</span></div></button>;
              })}
            </div>
          )}
        </section>

        {!documentsForbidden && (
          <section className="mt-12">
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em]" style={{ color: c.t3 }}>Manager scope</div>
            <h2 className="mt-2 text-2xl font-semibold">Shared documents</h2>
            <p className="mt-2 text-sm" style={{ color: c.t2 }}>Documents shared across sibling funds for this manager.</p>
            {documentsQuery.error ? <ErrorCard message={documentsQuery.error instanceof Error ? documentsQuery.error.message : "Could not load shared documents."} theme={theme} /> : (documentsQuery.data?.length ?? 0) === 0 ? <EmptyCard text="No manager-scoped documents yet." theme={theme} /> : (
              <div className="mt-5 overflow-hidden rounded-[1.5rem] border" style={{ borderColor: c.border, background: c.surface }}>
                {documentsQuery.data!.map((doc) => <div key={doc.doc_id} className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: c.borderLight }}><div className="min-w-0"><div className="truncate text-sm font-semibold">{doc.filename}</div><div className="mt-1 text-xs" style={{ color: c.t3 }}>Owned by {fundNames.get(doc.deal_id) ?? doc.deal_id}</div></div><span className="w-fit rounded-full border px-3 py-1 font-mono-plex text-[9px] uppercase tracking-[0.1em]" style={{ borderColor: c.accentTintBorder, background: c.accentTint, color: c.accentStrong }}>{DOC_CATEGORY_LABELS[doc.doc_category] ?? doc.doc_category}</span></div>)}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function EmptyCard({ text, theme }: { text: string; theme: "light" | "dark" }) {
  const c = ddTheme(theme);
  return <div className="mt-5 rounded-[1.5rem] border px-5 py-8 text-center text-sm" style={{ borderColor: c.border, background: c.surface, color: c.t2 }}>{text}</div>;
}

function ErrorCard({ message, theme }: { message: string; theme: "light" | "dark" }) {
  const isDark = theme === "dark";
  return <div className="mt-5 rounded-[1.5rem] border px-5 py-4 text-sm" style={{ borderColor: isDark ? "#4b1919" : "#f0c2bd", background: isDark ? "#2a1212" : "#fff1f2", color: isDark ? "#fca5a5" : "#9a2e23" }}>{message}</div>;
}
