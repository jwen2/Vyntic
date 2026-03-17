"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Citation } from "@/lib/api";

interface Props {
  index: number;
  citation: Citation | undefined;
}

export default function InlineCitation({ index, citation }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + window.scrollY - 4,
      left: rect.left + window.scrollX,
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
    return (
      <span className="inline text-[10px] bg-gray-100 text-gray-500 rounded px-1 font-mono">
        [{index}]
      </span>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline text-[10px] bg-blue-100 text-blue-700 rounded px-1 hover:bg-blue-200 transition-colors font-mono cursor-pointer align-super leading-none"
        title={`${citation.source_file} — Page ${citation.page}`}
      >
        [{index}]
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
              Source {index}
            </div>
            <div className="text-xs font-medium text-blue-700 mb-1.5">
              {citation.source_file} — Page {citation.page}
            </div>
            <div className="text-xs text-gray-600 leading-relaxed max-h-40 overflow-y-auto">
              {citation.text_snippet}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
