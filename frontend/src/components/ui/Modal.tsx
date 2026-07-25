import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import Button from "@/components/ui/Button";

export type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  /** Called on Escape, close-button click, and (unless disabled) scrim click. */
  onClose: () => void;
  size?: ModalSize;
  /** Renders the standard header. Omit to supply your own header as a child. */
  title?: string;
  /** Small uppercase kicker above the title (e.g. "LP position"). */
  eyebrow?: string;
  /** Supporting line under the title. */
  description?: ReactNode;
  /** Extra controls in the header, left of the close button (e.g. an upload button). */
  headerActions?: ReactNode;
  /** Default true when a header renders. Set false for dialogs that only close via their own buttons. */
  showClose?: boolean;
  /** Scrim click closes the dialog. Set false for forms, where a stray click would discard input. */
  closeOnOverlayClick?: boolean;
  /** Accessible name when no `title` is given. Ignored if `title` or `labelledBy` is set. */
  ariaLabel?: string;
  /** Id of an element labelling the dialog, when the caller renders its own heading. */
  labelledBy?: string;
  /** Extra classes on the panel (layout only — colour comes from modal.css). */
  className?: string;
  children: ReactNode;
}

/**
 * Shared dialog primitive. Owns the scrim, the panel chrome, and the optional
 * header; behaviour (initial focus, Tab trap, Escape, focus restore) comes from
 * the shared `useDialogA11y` hook. All colour resolves from CSS custom
 * properties (see modal.css / index.css), so it themes with the `.dark` class
 * and takes no `theme` prop — same contract as <Button>.
 *
 * The panel is a flex column with a capped height; `children` are its flex
 * items, so a dialog supplies its own scroll region and pinned footer rather
 * than being forced through fixed Body/Footer slots.
 */
export default function Modal({
  onClose,
  size = "md",
  title,
  eyebrow,
  description,
  headerActions,
  showClose = true,
  closeOnOverlayClick = true,
  ariaLabel,
  labelledBy,
  className,
  children,
}: ModalProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const titleId = useId();

  const hasHeader = Boolean(title || eyebrow || description || headerActions);
  const labelId = labelledBy ?? (title ? titleId : undefined);

  const panelClasses = ["modal-panel", `modal-panel--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className="modal-overlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
        tabIndex={-1}
        className={panelClasses}
        onClick={(event) => event.stopPropagation()}
      >
        {hasHeader && (
          <div className="modal-header">
            <div className="min-w-0">
              {eyebrow && (
                <div className="font-mono-plex modal-eyebrow">{eyebrow}</div>
              )}
              {title && (
                <h2 id={titleId} className="modal-title">
                  {title}
                </h2>
              )}
              {description && <p className="modal-description">{description}</p>}
            </div>
            {(headerActions || showClose) && (
              <div className="modal-header__actions">
                {headerActions}
                {showClose && (
                  <Button
                    variant="subtle"
                    size="sm"
                    iconOnly
                    aria-label="Close"
                    onClick={onClose}
                  >
                    <CloseIcon />
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}
