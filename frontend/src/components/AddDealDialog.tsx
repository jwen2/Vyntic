import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { CreateDealPayload, Manager, listManagers } from "@/lib/api";
import LandingButton from "@/components/landing/ui/LandingButton";
import LandingEyebrow from "@/components/landing/ui/LandingEyebrow";
import LandingHeading from "@/components/landing/ui/LandingHeading";
import LandingInput from "@/components/landing/ui/LandingInput";
import LandingPanel from "@/components/landing/ui/LandingPanel";
import LandingText from "@/components/landing/ui/LandingText";

const NEW_MANAGER = "__new__";

interface Props {
  onAdd: (payload: CreateDealPayload & { new_manager_name?: string }) => void;
  onClose: () => void;
}

export default function AddDealDialog({ onAdd, onClose }: Props) {
  const { theme } = useTheme();
  const [entityType, setEntityType] = useState<"deal" | "fund">("deal");
  const [dealId, setDealId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [managers, setManagers] = useState<Manager[]>([]);
  const [managerId, setManagerId] = useState<string>(NEW_MANAGER);
  const [newManagerName, setNewManagerName] = useState("");
  const [vintage, setVintage] = useState("");
  const [strategy, setStrategy] = useState("");
  const isDark = theme === "dark";

  useEffect(() => {
    if (entityType !== "fund") return;
    listManagers()
      .then((list) => {
        setManagers(list);
        if (list.length > 0) setManagerId(list[0].manager_id);
      })
      .catch(() => setManagers([]));
  }, [entityType]);

  const isFund = entityType === "fund";
  const managerReady =
    !isFund || (managerId === NEW_MANAGER ? newManagerName.trim().length > 0 : true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealId.trim() || !name.trim() || !managerReady) return;
    const payload: CreateDealPayload & { new_manager_name?: string } = {
      deal_id: dealId.trim(),
      name: name.trim(),
      description: description.trim(),
      entity_type: entityType,
    };
    if (isFund) {
      payload.stage = "Screening";
      if (managerId === NEW_MANAGER) {
        payload.new_manager_name = newManagerName.trim();
      } else {
        payload.manager_id = managerId;
      }
      const vintageYear = parseInt(vintage, 10);
      if (!Number.isNaN(vintageYear)) payload.vintage = vintageYear;
      if (strategy.trim()) payload.strategy = strategy.trim();
    }
    onAdd(payload);
    onClose();
  };

  const inputDark = isDark
    ? "border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-white/40"
    : "";
  const selectClass = `w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors ${
    isDark
      ? "border-white/10 bg-white/5 text-white focus:border-white/40"
      : "border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-text)] focus:border-[var(--landing-inverse)]"
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <LandingPanel
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto"
        variant={isDark ? "inverse" : "default"}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <LandingEyebrow className={isDark ? "text-white/55" : ""}>
              {isFund ? "New fund" : "New deal"}
            </LandingEyebrow>
            <LandingHeading className={`mt-4 ${isDark ? "text-white" : ""}`}>
              {isFund ? "Create a fund workspace." : "Create a deal workspace."}
            </LandingHeading>
            <LandingText className="mt-3" tone={isDark ? "inverseMuted" : "muted"}>
              {isFund
                ? "Track a manager's fund through diligence, commitment, and monitoring."
                : "Set the deal identifier, name, and optional context for the new workspace."}
            </LandingText>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border text-lg"
            style={{
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "var(--landing-border)",
              color: isDark ? "rgba(255,255,255,0.72)" : "var(--landing-muted)",
            }}
            aria-label="Close add deal dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <Field label="Workspace type" htmlFor="entityType" dark={isDark}>
            <div className="flex gap-2" id="entityType" role="radiogroup">
              {(["deal", "fund"] as const).map((type) => {
                const active = entityType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setEntityType(type)}
                    className="flex-1 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors"
                    style={{
                      borderColor: active
                        ? isDark
                          ? "#ffffff"
                          : "#111111"
                        : isDark
                          ? "rgba(255,255,255,0.12)"
                          : "var(--landing-border)",
                      background: active
                        ? isDark
                          ? "rgba(255,255,255,0.1)"
                          : "#111111"
                        : "transparent",
                      color: active
                        ? isDark
                          ? "#ffffff"
                          : "#ffffff"
                        : isDark
                          ? "rgba(255,255,255,0.72)"
                          : "var(--landing-text)",
                    }}
                  >
                    {type === "deal" ? "Deal" : "Fund (LP)"}
                  </button>
                );
              })}
            </div>
          </Field>

          {isFund && (
            <>
              <Field label="Manager (GP firm)" htmlFor="manager" dark={isDark}>
                <select
                  id="manager"
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className={selectClass}
                >
                  {managers.map((m) => (
                    <option key={m.manager_id} value={m.manager_id}>
                      {m.name}
                    </option>
                  ))}
                  <option value={NEW_MANAGER}>+ New manager…</option>
                </select>
              </Field>

              {managerId === NEW_MANAGER && (
                <Field label="New manager name" htmlFor="newManagerName" dark={isDark}>
                  <LandingInput
                    id="newManagerName"
                    type="text"
                    value={newManagerName}
                    onChange={(e) => setNewManagerName(e.target.value)}
                    placeholder="e.g. Hillpath Capital"
                    required
                    className={inputDark}
                  />
                </Field>
              )}
            </>
          )}

          <Field label={isFund ? "Fund ID" : "Deal ID"} htmlFor="dealId" dark={isDark}>
            <LandingInput
              id="dealId"
              type="text"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder={isFund ? "e.g. hillpath_fund_iv" : "e.g. project_atlas"}
              required
              className={inputDark}
            />
          </Field>

          <Field label={isFund ? "Fund name" : "Deal name"} htmlFor="name" dark={isDark}>
            <LandingInput
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isFund ? "e.g. Hillpath Fund IV" : "e.g. Project Atlas - Industrial software"
              }
              required
              className={inputDark}
            />
          </Field>

          {isFund && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vintage year" htmlFor="vintage" dark={isDark}>
                <LandingInput
                  id="vintage"
                  type="number"
                  value={vintage}
                  onChange={(e) => setVintage(e.target.value)}
                  placeholder="2026"
                  className={inputDark}
                />
              </Field>
              <Field label="Strategy" htmlFor="strategy" dark={isDark}>
                <LandingInput
                  id="strategy"
                  type="text"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  placeholder="e.g. Buyout"
                  className={inputDark}
                />
              </Field>
            </div>
          )}

          <Field label="Description" htmlFor="description" dark={isDark}>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional context for the workspace"
              rows={3}
              className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition-colors ${
                isDark
                  ? "border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-white/40"
                  : "border-[var(--landing-border)] bg-[var(--landing-surface)] text-[var(--landing-text)] placeholder:text-[var(--landing-muted)] focus:border-[var(--landing-inverse)]"
              }`}
            />
          </Field>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <LandingButton type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </LandingButton>
            <LandingButton
              type="submit"
              className={isDark ? "w-full bg-white text-black hover:bg-white/90 sm:w-auto" : "w-full sm:w-auto"}
            >
              {isFund ? "Create fund" : "Create deal"}
            </LandingButton>
          </div>
        </form>
      </LandingPanel>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  dark,
  children,
}: {
  label: string;
  htmlFor: string;
  dark: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block font-mono-plex text-[10px] uppercase tracking-[0.18em]"
        style={{ color: dark ? "rgba(255,255,255,0.55)" : "var(--landing-muted)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
