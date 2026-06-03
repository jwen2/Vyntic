import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import LandingButton from "@/components/landing/ui/LandingButton";
import LandingEyebrow from "@/components/landing/ui/LandingEyebrow";
import LandingHeading from "@/components/landing/ui/LandingHeading";
import LandingInput from "@/components/landing/ui/LandingInput";
import LandingPanel from "@/components/landing/ui/LandingPanel";
import LandingText from "@/components/landing/ui/LandingText";

interface Props {
  onAdd: (deal_id: string, name: string, description: string) => void;
  onClose: () => void;
}

export default function AddDealDialog({ onAdd, onClose }: Props) {
  const { theme } = useTheme();
  const [dealId, setDealId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const isDark = theme === "dark";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dealId.trim() && name.trim()) {
      onAdd(dealId.trim(), name.trim(), description.trim());
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <LandingPanel
        className="w-full max-w-lg"
        variant={isDark ? "inverse" : "default"}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <LandingEyebrow className={isDark ? "text-white/55" : ""}>
              New deal
            </LandingEyebrow>
            <LandingHeading className={`mt-4 ${isDark ? "text-white" : ""}`}>
              Create a deal workspace.
            </LandingHeading>
            <LandingText className="mt-3" tone={isDark ? "inverseMuted" : "muted"}>
              Set the deal identifier, name, and optional context for the new
              workspace.
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
          <Field label="Deal ID" htmlFor="dealId" dark={isDark}>
            <LandingInput
              id="dealId"
              type="text"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="e.g. project_atlas"
              required
              className={isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-white/40" : ""}
            />
          </Field>

          <Field label="Deal name" htmlFor="name" dark={isDark}>
            <LandingInput
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Atlas - Industrial software"
              required
              className={isDark ? "border-white/10 bg-white/5 text-white placeholder:text-white/40 focus:border-white/40" : ""}
            />
          </Field>

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
            <LandingButton type="submit" className={isDark ? "w-full bg-white text-black hover:bg-white/90 sm:w-auto" : "w-full sm:w-auto"}>
              Create deal
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
