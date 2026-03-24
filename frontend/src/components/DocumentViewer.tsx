"use client";
import { useEffect } from "react";

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
  const lower = filename.toLowerCase();
  const isPdf = lower.endsWith(".pdf");
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
  const isPreviewable = isPdf || isExcel;
  const viewUrl = `/api/deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(filename)}/view`;

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
      {/* Overlay */}
      <div
        className="flex-1 bg-black/30 transition-opacity"
        onClick={onClose}
      />
      {/* Full-screen panel */}
      <div className="w-[90vw] max-w-[1400px] bg-white shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{filename}</h3>
            <span className="text-sm text-gray-500">Page {page}</span>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors text-xl leading-none"
            title="Close viewer"
          >
            &#10005;
          </button>
        </div>

        {/* Citation snippet */}
        <div className="p-3 bg-amber-50 border-b border-amber-100 text-sm shrink-0">
          <span className="font-medium text-amber-800">Referenced text:</span>
          <p className="mt-1 text-gray-700 leading-relaxed">{snippet}</p>
        </div>

        {/* Document content */}
        <div className="flex-1 min-h-0">
          {isPreviewable ? (
            <iframe
              src={isPdf ? `${viewUrl}#page=${page}` : viewUrl}
              className="w-full h-full border-0"
              title={`${filename}${isPdf ? ` - Page ${page}` : ""}`}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
              <svg
                className="w-16 h-16 mb-4 text-gray-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <p className="text-lg font-medium text-gray-700 mb-2">
                Inline preview not available
              </p>
              <p className="text-sm mb-4">
                This file type does not support inline viewing.
              </p>
              <a
                href={viewUrl}
                download={filename}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
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
