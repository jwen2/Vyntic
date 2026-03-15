"use client";
import { useState, useRef, useEffect } from "react";
import { Citation } from "@/lib/api";

interface Props {
  citations: Citation[];
  children: React.ReactNode;
}

export default function CitationPopover({ citations, children }: Props) {
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

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {children}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-96 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl p-3">
          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Sources ({citations.length})
          </div>
          {citations.map((c, i) => (
            <div
              key={i}
              className="mb-2 p-2 bg-gray-50 rounded text-xs border border-gray-100"
            >
              <div className="font-medium text-blue-700 mb-1">
                {c.source_file} — Page {c.page}
              </div>
              <div className="text-gray-600 leading-relaxed">
                {c.text_snippet}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
