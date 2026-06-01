"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Citation } from "@/lib/api";
import CitationSnippet from "./dd/CitationSnippet";
import { citationReferenceLabel } from "@/lib/citationLabels";

interface Props {
  index: number;
  citation: Citation | null | undefined;
  onViewDocument?: (citation: Citation) => void;
}

export default function InlineCitation({ index, citation, onViewDocument }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // Use viewport-relative coords directly (no scroll offset) for position:fixed
    setPos({
      top: rect.top - 4,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, updatePosition]);

  if (!citation) {
    // No matching source — hide the badge entirely to avoid showing broken citations
    return null;
  }

  const label = citationReferenceLabel(citation);

  const handleViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (onViewDocument) {
      onViewDocument(citation);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex items-center text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 hover:bg-blue-200 transition-colors font-mono cursor-pointer align-baseline leading-none mx-0.5"
        title={`${citation.source_file} — Page ${citation.page}`}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-[9999] w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-3 text-left"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translateY(-100%)",
            }}
          >
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Source evidence
            </div>
            <div className="text-xs font-medium text-blue-700 mb-1.5">
              {citation.source_file} — Page {citation.page}
            </div>
            <div className="text-xs text-gray-600 leading-relaxed max-h-40 overflow-y-auto">
              <CitationSnippet sourceFile={citation.source_file} text={citation.text_snippet} />
            </div>
            {onViewDocument && (
              <button
                onClick={handleViewClick}
                className="mt-2 w-full text-xs text-center py-1.5 px-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors font-medium"
              >
                View document
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
