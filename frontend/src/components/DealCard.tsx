"use client";
import { useState, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Deal } from "@/lib/api";
import DealDetailPanel from "./DealDetailPanel";

const STAGE_COLORS: Record<string, string> = {
  Screening: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400",
  "Due Diligence": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  "IC Review": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400",
  Closed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400",
};

const STAGES = ["Screening", "Due Diligence", "IC Review", "Closed"];
const SECTOR_TAGS = [
  "Technology", "Healthcare", "Industrials", "Consumer",
  "Financial Services", "Energy", "Real Estate", "Infrastructure",
];

interface Props {
  deal: Deal;
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onUploadFiles: (dealId: string, files: File[]) => void;
  onUpdateDeal: (
    dealId: string,
    data: { stage?: string; tags?: string[] }
  ) => void;
  onDocumentDeleted?: () => void;
  uploading: boolean;
  readOnly?: boolean;
}

export default function DealCard({
  deal,
  expanded,
  onToggleExpand,
  onDelete,
  onUploadFiles,
  onUpdateDeal,
  onDocumentDeleted,
  uploading,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files).filter(
      (f) =>
        f.name.endsWith(".pdf") ||
        f.name.endsWith(".xlsx") ||
        f.name.endsWith(".xls")
    );
    if (files.length > 0) {
      onUploadFiles(deal.deal_id, files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      onUploadFiles(deal.deal_id, files);
    }
    e.target.value = "";
  };

  const stageColor = STAGE_COLORS[deal.stage] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";

  return (
    <li
      className={`rounded-lg border transition-all ${
        dragging
          ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-200 dark:ring-blue-800"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
      onDragEnter={readOnly ? undefined : handleDragEnter}
      onDragLeave={readOnly ? undefined : handleDragLeave}
      onDragOver={readOnly ? undefined : handleDragOver}
      onDrop={readOnly ? undefined : handleDrop}
    >
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between group">
          <div
            className="cursor-pointer flex-1 min-w-0"
            onClick={() => router.push(`/deal/${deal.deal_id}`)}
          >
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
              {deal.name}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {deal.deal_id} · {deal.document_count} doc
              {deal.document_count !== 1 ? "s" : ""}
            </div>
          </div>
          <button
            onClick={onToggleExpand}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-xs ml-1 mt-0.5 px-1"
            title="Expand details"
          >
            {expanded ? "▾" : "▸"}
          </button>
          {!readOnly && (
            <button
              onClick={onDelete}
              className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs ml-2 mt-0.5"
              title="Delete deal"
            >
              ✕
            </button>
          )}
        </div>

        {/* Stage + Tags row */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {/* Stage badge */}
          <div className="relative">
            {readOnly ? (
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stageColor}`}>
                {deal.stage}
              </span>
            ) : (
              <>
                <button
                  onClick={() => {
                    setShowStageMenu(!showStageMenu);
                    setShowTagMenu(false);
                  }}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${stageColor} hover:opacity-80 transition-opacity`}
                >
                  {deal.stage}
                </button>
                {showStageMenu && (
                  <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 py-1 w-36">
                    {STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          onUpdateDeal(deal.deal_id, { stage: s });
                          setShowStageMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                          s === deal.stage ? "font-semibold text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Tags */}
          {deal.tags.map((tag) => (
            <span
              key={tag}
              className={`text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 ${
                readOnly ? "" : "cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              }`}
              title={readOnly ? undefined : `Click to remove "${tag}"`}
              onClick={readOnly ? undefined : () =>
                onUpdateDeal(deal.deal_id, {
                  tags: deal.tags.filter((t) => t !== tag),
                })
              }
            >
              {tag}
            </span>
          ))}

          {/* Add tag button */}
          {!readOnly && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowTagMenu(!showTagMenu);
                  setShowStageMenu(false);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                + tag
              </button>
              {showTagMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 py-1 w-40 max-h-48 overflow-y-auto">
                  {SECTOR_TAGS.filter((t) => !deal.tags.includes(t)).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        onUpdateDeal(deal.deal_id, {
                          tags: [...deal.tags, tag],
                        });
                        setShowTagMenu(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drop zone hint */}
        {dragging && (
          <div className="mt-2 py-3 border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-md bg-blue-50 dark:bg-blue-950/30 text-center">
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              Drop PDF/Excel files here
            </span>
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />
            Parsing and indexing...
          </div>
        )}

        {/* DD Workspace button */}
        <button
          onClick={() => router.push(`/deal/${deal.deal_id}`)}
          className="mt-2 w-full text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 py-1.5 bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-md transition-colors"
        >
          Open DD Workspace
        </button>

        {/* Browse files button */}
        {!readOnly && !dragging && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1.5 w-full text-[10px] text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 py-1 border border-dashed border-gray-200 dark:border-gray-700 rounded hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
          >
            Drop files or click to upload
          </button>
        )}
        {!readOnly && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        )}

        {/* Expanded detail */}
        {expanded && <DealDetailPanel deal={deal} onDocumentDeleted={onDocumentDeleted} />}
      </div>
    </li>
  );
}
