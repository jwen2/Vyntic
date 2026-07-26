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
import Button from "@/components/ui/Button";
import { stageBadge } from "@/lib/stageBadges";

export default function ManagerPage() {
  const { managerId: managerIdParam } = useParams<{ managerId: string }>();
  const managerId = managerIdParam ?? "";
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
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
    return <div className="flex min-h-screen items-center justify-center bg-appbg"><div className="dd-spin h-8 w-8 rounded-full border-4 border-edge" style={{ borderTopColor: "var(--accent)" }} /></div>;
  }
  if (!managerQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 bg-appbg text-t1">
        <div className="text-center"><h1 className="text-xl font-semibold">Manager not found</h1><p className="mt-2 text-sm text-t2">{managerQuery.error instanceof Error ? managerQuery.error.message : "This manager is unavailable."}</p><Button variant="primary" size="sm" className="mt-5" onClick={() => navigate("/app")}>All funds</Button></div>
      </div>
    );
  }

  const manager = managerQuery.data;
  return (
    <div className="min-h-screen bg-appbg text-t1" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <header className="border-b border-b-edge bg-surface px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Button variant="secondary" size="sm" onClick={() => navigate("/app")}>← All funds</Button>
          <Button variant="secondary" size="sm" iconOnly aria-label="Toggle theme" onClick={toggleTheme} style={{ fontSize: 15 }}>{isDark ? "☀" : "☾"}</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <section className="rounded-[2rem] border border-edge bg-surface p-6 sm:p-8">
          <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-t3">Fund manager</div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold sm:text-4xl">{manager.name}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-t2">{manager.description || "No manager description has been added yet."}</p>
            </div>
            <div className="rounded-full border border-accent-tint-border bg-accent-tint px-4 py-3 text-center">
              <div className="font-mono-plex text-[9px] uppercase tracking-[0.14em] text-t3">Funds</div>
              <div className="mt-1 text-xl font-semibold text-accent-strong">{manager.fund_count}</div>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-end justify-between"><div><div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-t3">Portfolio</div><h2 className="mt-2 text-2xl font-semibold">Funds</h2></div><span className="text-sm text-t2">{funds.length} visible</span></div>
          {fundsQuery.error ? <ErrorCard message={fundsQuery.error instanceof Error ? fundsQuery.error.message : "Could not load funds."} /> : funds.length === 0 ? <EmptyCard text="No accessible funds are linked to this manager." /> : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {funds.map((fund) => {
                const badge = stageBadge(fund.stage);
                return (
                  <button
                    key={fund.deal_id}
                    type="button"
                    onClick={() => navigate(`/deal/${encodeURIComponent(fund.deal_id)}`)}
                    className="rounded-[1.5rem] border border-edge bg-surface text-t1 p-5 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono-plex text-[9px] uppercase tracking-[0.14em] text-t3">{fund.vintage ?? "Vintage —"}</div>
                        <h3 className="mt-2 text-lg font-semibold">{fund.name}</h3>
                      </div>
                      <span
                        className="rounded-full border px-2.5 py-1 font-mono-plex text-[9px] uppercase tracking-[0.1em]"
                        // Fund-stage badges are data-driven (stageBadge()); the
                        // ddTheme fallback for an unrecognized stage is the
                        // only token here, so this stays inline.
                        style={{
                          background: badge?.bg ?? "var(--surface-alt)",
                          borderColor: badge?.border ?? "var(--border)",
                          color: badge?.fg ?? "var(--text-2)",
                        }}
                      >
                        {fund.stage}
                      </span>
                    </div>
                    <div className="mt-6 flex items-center justify-between text-sm text-t2">
                      <span>{fund.strategy || "Strategy not set"}</span>
                      <span>{fund.document_count} docs →</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {!documentsForbidden && (
          <section className="mt-12">
            <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-t3">Manager scope</div>
            <h2 className="mt-2 text-2xl font-semibold">Shared documents</h2>
            <p className="mt-2 text-sm text-t2">Documents shared across sibling funds for this manager.</p>
            {documentsQuery.error ? <ErrorCard message={documentsQuery.error instanceof Error ? documentsQuery.error.message : "Could not load shared documents."} /> : (documentsQuery.data?.length ?? 0) === 0 ? <EmptyCard text="No manager-scoped documents yet." /> : (
              <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-edge bg-surface">
                {documentsQuery.data!.map((doc) => (
                  <div key={doc.doc_id} className="flex flex-col gap-3 border-b border-b-edge-light px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{doc.filename}</div>
                      <div className="mt-1 text-xs text-t3">Owned by {fundNames.get(doc.deal_id) ?? doc.deal_id}</div>
                    </div>
                    <span className="w-fit rounded-full border border-accent-tint-border bg-accent-tint text-accent-strong px-3 py-1 font-mono-plex text-[9px] uppercase tracking-[0.1em]">
                      {DOC_CATEGORY_LABELS[doc.doc_category] ?? doc.doc_category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <div className="mt-5 rounded-[1.5rem] border border-edge bg-surface text-t2 px-5 py-8 text-center text-sm">{text}</div>;
}

function ErrorCard({ message }: { message: string }) {
  return <div className="mt-5 rounded-[1.5rem] border px-5 py-4 text-sm" style={{ borderColor: "var(--danger-tint-border)", background: "var(--danger-tint)", color: "var(--danger)" }}>{message}</div>;
}
