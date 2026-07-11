import { useTheme } from "@/components/ThemeProvider";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import LandingButton from "@/components/landing/ui/LandingButton";
import LandingEyebrow from "@/components/landing/ui/LandingEyebrow";
import LandingHeading from "@/components/landing/ui/LandingHeading";
import LandingPanel from "@/components/landing/ui/LandingPanel";
import LandingText from "@/components/landing/ui/LandingText";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const dialogRef = useDialogA11y<HTMLDivElement>(onCancel);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 outline-none"
    >
      <LandingPanel
        className="w-full max-w-md"
        variant={isDark ? "inverse" : "default"}
      >
        <LandingEyebrow className={isDark ? "text-white/55" : ""}>
          Confirm action
        </LandingEyebrow>
        <LandingHeading className={`mt-4 ${isDark ? "text-white" : ""}`}>
          {title}
        </LandingHeading>
        <LandingText className="mt-4" tone={isDark ? "inverseMuted" : "muted"}>
          {message}
        </LandingText>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <LandingButton type="button" variant="ghost" onClick={onCancel} className="w-full sm:w-auto">
            {cancelLabel}
          </LandingButton>
          <LandingButton
            type="button"
            onClick={onConfirm}
            className={isDark ? "w-full bg-white text-black hover:bg-white/90 sm:w-auto" : "w-full sm:w-auto"}
          >
            {confirmLabel}
          </LandingButton>
        </div>
      </LandingPanel>
    </div>
  );
}
