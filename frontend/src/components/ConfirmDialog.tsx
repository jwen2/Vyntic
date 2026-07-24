import Button, { type ButtonVariant } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Defaults to `danger` — most confirms here guard deletes or discard work.
   * Pass `primary` for benign choices (e.g. "open the existing copy"), which
   * must not read as destructive.
   */
  confirmVariant?: ButtonVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      onClose={onCancel}
      size="sm"
      eyebrow="Confirm action"
      title={title}
      showClose={false}
      // A destructive confirm shouldn't be dismissable by a stray scrim click.
      closeOnOverlayClick={false}
    >
      <div className="px-[18px] py-5">
        <p className="m-0 text-[13px] leading-relaxed text-t2">{message}</p>
        {/* Column stretches the buttons to full width on mobile via the default
            align-items:stretch; on sm+ they size to content. Deliberately not
            `fullWidth`/`w-full` — button.css loads after Tailwind utilities, so
            .btn--full would win over any sm:w-auto reset. */}
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
