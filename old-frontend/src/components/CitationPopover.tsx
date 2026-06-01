"use client";
import { useState, useRef, useEffect } from "react";
import { Citation } from "@/lib/api";
import CitationSnippet from "./dd/CitationSnippet";

interface Props {
  citations: Citation[];
  children: React.ReactNode;
  onViewDocument?: (citation: Citation) => void;
}

export default function CitationPopover({ citations, children, onViewDocument }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (citations.length === 0) return <>{children}</>;

  const handleCitationClick = (citation: Citation) => {
    setOpen(false);
    if (onViewDocument) {
      onViewDocument(citation);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="select-text">{children}</div>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-96 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl p-3">
          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Sources ({citations.length})
          </div>
          {citations.map((c, i) => (
            <div
              key={i}
              className={`mb-2 p-2 bg-gray-50 rounded text-xs border border-gray-100 ${
                onViewDocument ? "cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors" : ""
              }`}
              onClick={onViewDocument ? () => handleCitationClick(c) : undefined}
            >
              <div className="font-medium text-blue-700 mb-1 flex items-center justify-between">
                <span>{c.source_file} — Page {c.page}</span>
                {onViewDocument && (
                  <span className="text-[10px] text-blue-500 font-normal">
                    Click to view
                  </span>
                )}
              </div>
              <div className="text-gray-600 leading-relaxed select-text">
                <CitationSnippet sourceFile={c.source_file} text={c.text_snippet} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
