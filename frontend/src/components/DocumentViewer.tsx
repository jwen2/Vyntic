import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { getDocumentViewToken } from "@/lib/api";
import CitationSnippet from "./dd/CitationSnippet";

interface Props {
  dealId: string;
  filename: string;
  page: number;
  snippet: string;
  onClose: () => void;
}

export default function DocumentViewer({
  dealId,
  filename,
  page,
  snippet,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const surface = isDark ? "#151515" : "#ffffff";
  const surfaceAlt = isDark ? "#101010" : "#f8f8f4";
  const border = isDark ? "#262626" : "var(--landing-border)";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
  const muted = isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)";
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  const isPreviewable = isPdf || isExcel;

  // The iframe cannot send an Authorization header, so we mint a short-lived
  // token scoped to exactly this document (S5) instead of leaking the
  // session JWT into the URL.
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setViewToken(null);
    setTokenError(false);
    getDocumentViewToken(dealId, filename)
      .then((t) => {
        if (!cancelled) setViewToken(t);
      })
      .catch(() => {
        if (!cancelled) setTokenError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dealId, filename]);

  const params = new URLSearchParams();
  if (viewToken) params.set("token", viewToken);
  if (isExcel && page > 0) params.set("sheet", String(Math.max(0, page - 1)));
  const query = params.toString();
  const viewUrl = `/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(filename)}/view${query ? `?${query}` : ""}`;
  const locatorLabel = isExcel ? "Sheet" : "Page";

  // role/focus-trap/restore via the shared hook; Escape stays global below
  // because the viewer embeds a cross-origin iframe that can swallow keydowns.
  const dialogRef = useDialogA11y<HTMLDivElement>();

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex">
      <div
        className="flex-1 bg-black/35 transition-opacity"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Document viewer: ${filename}`}
        tabIndex={-1}
        className="animate-slide-in-right flex w-[94vw] max-w-[1400px] flex-col shadow-2xl outline-none sm:w-[90vw]"
        style={{ background: surface }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-4 sm:px-5"
          style={{ borderBottomColor: border }}
        >
          <div className="min-w-0">
            <div
              className="font-mono-plex"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: muted,
                marginBottom: 6,
              }}
            >
              Document viewer
            </div>
            <h3 className="truncate text-base font-semibold" style={{ color: text }}>
              {filename}
            </h3>
            <span className="text-sm" style={{ color: muted }}>
              {locatorLabel} {page}
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-4 flex h-10 w-10 items-center justify-center rounded-full border text-xl leading-none"
            style={{
              borderColor: border,
              color: muted,
              background: surfaceAlt,
            }}
            title="Close viewer"
          >
            &#10005;
          </button>
        </div>

        <div
          className="shrink-0 border-b px-4 py-4 text-sm sm:px-5"
          style={{ background: surfaceAlt, borderBottomColor: border }}
        >
          <span className="font-medium" style={{ color: text }}>
            Referenced text:
          </span>
          <CitationSnippet sourceFile={filename} text={snippet} variant="viewer" />
        </div>

        <div className="flex-1 min-h-0">
          {tokenError ? (
            <div
              className="flex h-full items-center justify-center p-8 text-center text-sm"
              style={{ color: muted }}
            >
              Could not authorize the document viewer. Close and try again.
            </div>
          ) : isPreviewable && !viewToken ? (
            <div
              className="flex h-full items-center justify-center p-8 text-center text-sm"
              style={{ color: muted }}
            >
              Loading document…
            </div>
          ) : isPreviewable ? (
            <iframe
              src={isPdf ? `${viewUrl}#page=${page}` : viewUrl}
              className="w-full h-full border-0"
              title={`${filename}${isPreviewable ? ` - Page ${page}` : ""}`}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center" style={{ color: muted }}>
              <svg
                className="mb-4 h-16 w-16"
                fill="none"
                viewBox="0 0 24 24"
                stroke={muted}
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="mb-2 text-lg font-medium" style={{ color: text }}>
                Inline preview not available
              </p>
              <p className="text-sm mb-4">
                This file type does not support inline viewing.
              </p>
              <a
                href={viewUrl}
                download={filename}
                className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium"
                style={{
                  background: isDark ? "#f5f5f5" : "#111111",
                  color: isDark ? "#111111" : "#ffffff",
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
