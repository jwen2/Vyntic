"use client";
import { useState, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Deal } from "@/lib/api";

const STAGE_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  Screening: { bg: "#422006", fg: "#fdba74", border: "#7c2d12" },
  "Due Diligence": { bg: "#1e3a8a", fg: "#93c5fd", border: "#1e40af" },
  "IC Review": { bg: "#581c87", fg: "#e9d5ff", border: "#6b21a8" },
  Closed: { bg: "#14532d", fg: "#86efac", border: "#166534" },
};

const STAGES = ["Screening", "Due Diligence", "IC Review", "Closed"];
const SECTOR_TAGS = [
  "Technology",
  "Healthcare",
  "Industrials",
  "Consumer",
  "Financial Services",
  "Energy",
  "Real Estate",
  "Infrastructure",
];

interface Props {
  deal: Deal;
  selected?: boolean;
  onSelect?: () => void;
  onInvestigate?: () => void;
  onDelete: () => void;
  onUploadFiles: (dealId: string, files: File[]) => void;
  onUpdateDeal: (
    dealId: string,
    data: { stage?: string; tags?: string[] }
  ) => void;
  uploading: boolean;
  readOnly?: boolean;
}

export default function DealListItem({
  deal,
  selected = false,
  onSelect,
  onInvestigate,
  onDelete,
  onUploadFiles,
  onUpdateDeal,
  uploading,
  readOnly,
}: Props) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [hov, setHov] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
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
    if (files.length > 0) onUploadFiles(deal.deal_id, files);
  };

  const stage =
    STAGE_COLORS[deal.stage] || {
      bg: "#1e293b",
      fg: "#94a3b8",
      border: "#334155",
    };

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onDragEnter={readOnly ? undefined : handleDragEnter}
      onDragLeave={readOnly ? undefined : handleDragLeave}
      onDragOver={readOnly ? undefined : handleDragOver}
      onDrop={readOnly ? undefined : handleDrop}
      style={{
        padding: "10px 11px",
        marginBottom: 4,
        background: dragging
          ? "rgba(37,99,235,.15)"
          : selected
          ? "#1e3a8a"
          : hov
          ? "#1e293b"
          : "#0b1220",
        border: `1px solid ${
          dragging ? "#2563eb" : selected ? "#3b82f6" : hov ? "#334155" : "#1e293b"
        }`,
        borderRadius: 6,
        transition: "all .12s",
      }}
    >
      {/* Header: name + delete */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => {
            if (onSelect) onSelect();
            else router.push(`/deal/${deal.deal_id}`);
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            textAlign: "left",
            flex: 1,
            minWidth: 0,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            const title = e.currentTarget.firstChild as HTMLElement;
            if (title) title.style.color = "#93c5fd";
          }}
          onMouseLeave={(e) => {
            const title = e.currentTarget.firstChild as HTMLElement;
            if (title) title.style.color = "#e2e8f0";
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#e2e8f0",
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              transition: "color .12s",
            }}
            title={deal.name}
          >
            {deal.name}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
            {deal.deal_id} · {deal.document_count} doc
            {deal.document_count !== 1 ? "s" : ""}
          </div>
        </button>
        {onInvestigate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInvestigate();
            }}
            title={`Open agent and workstreams for ${deal.name}`}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#bfdbfe";
              e.currentTarget.style.borderColor = "#3b82f6";
              e.currentTarget.style.background = "#1e3a8a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = selected ? "#bfdbfe" : "#60a5fa";
              e.currentTarget.style.borderColor = selected ? "#3b82f6" : "#1e40af";
              e.currentTarget.style.background = selected ? "#1e40af" : "transparent";
            }}
            style={{
              flexShrink: 0,
              marginTop: 1,
              padding: "2px 6px",
              background: selected ? "#1e40af" : "transparent",
              color: selected ? "#bfdbfe" : "#60a5fa",
              border: `1px solid ${selected ? "#3b82f6" : "#1e40af"}`,
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              lineHeight: 1.4,
              cursor: "pointer",
            }}
          >
            Analyze
          </button>
        )}
        {!readOnly && hov && (
          <button
            onClick={onDelete}
            title="Delete deal"
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: 12,
              padding: "0 4px",
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ef4444";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#475569";
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Stage + tags */}
      <div
        className="flex items-center gap-1 flex-wrap"
        style={{ marginTop: 6 }}
      >
        <div style={{ position: "relative" }}>
          {readOnly ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 99,
                background: stage.bg,
                color: stage.fg,
                border: `1px solid ${stage.border}`,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
              }}
            >
              {deal.stage}
            </span>
          ) : (
            <>
              <button
                onClick={() => {
                  setShowStageMenu(!showStageMenu);
                  setShowTagMenu(false);
                }}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 99,
                  background: stage.bg,
                  color: stage.fg,
                  border: `1px solid ${stage.border}`,
                  cursor: "pointer",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                }}
              >
                {deal.stage}
              </button>
              {showStageMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 4,
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 6,
                    boxShadow: "0 4px 12px rgba(0,0,0,.5)",
                    zIndex: 30,
                    padding: 4,
                    minWidth: 140,
                  }}
                >
                  {STAGES.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        onUpdateDeal(deal.deal_id, { stage: s });
                        setShowStageMenu(false);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#1e293b";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "5px 10px",
                        fontSize: 11,
                        background: "transparent",
                        color: s === deal.stage ? "#60a5fa" : "#cbd5e1",
                        fontWeight: s === deal.stage ? 600 : 400,
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {deal.tags.map((tag) => (
          <span
            key={tag}
            title={readOnly ? undefined : `Click to remove "${tag}"`}
            onClick={
              readOnly
                ? undefined
                : () =>
                    onUpdateDeal(deal.deal_id, {
                      tags: deal.tags.filter((t) => t !== tag),
                    })
            }
            style={{
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              background: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              cursor: readOnly ? "default" : "pointer",
            }}
          >
            {tag}
          </span>
        ))}

        {!readOnly && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setShowTagMenu(!showTagMenu);
                setShowStageMenu(false);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#60a5fa";
                e.currentTarget.style.borderColor = "#1e40af";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#475569";
                e.currentTarget.style.borderColor = "#334155";
              }}
              style={{
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 3,
                background: "transparent",
                color: "#475569",
                border: "1px dashed #334155",
                cursor: "pointer",
              }}
            >
              + tag
            </button>
            {showTagMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  boxShadow: "0 4px 12px rgba(0,0,0,.5)",
                  zIndex: 30,
                  padding: 4,
                  width: 160,
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {SECTOR_TAGS.filter((t) => !deal.tags.includes(t)).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      onUpdateDeal(deal.deal_id, {
                        tags: [...deal.tags, tag],
                      });
                      setShowTagMenu(false);
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#1e293b";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "4px 8px",
                      fontSize: 11,
                      background: "transparent",
                      color: "#cbd5e1",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
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
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: "1px dashed #2563eb",
            borderRadius: 4,
            background: "rgba(37,99,235,.1)",
            textAlign: "center",
            fontSize: 11,
            color: "#93c5fd",
            fontWeight: 600,
          }}
        >
          Drop PDF / Excel here
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 6, fontSize: 11, color: "#60a5fa" }}
        >
          <div
            className="animate-spin"
            style={{
              width: 10,
              height: 10,
              border: "1.5px solid #2563eb",
              borderTopColor: "transparent",
              borderRadius: "50%",
            }}
          />
          Indexing...
        </div>
      )}

      {/* Browse upload (admin) */}
      {!readOnly && !dragging && (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#60a5fa";
              e.currentTarget.style.borderColor = "#1e40af";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#475569";
              e.currentTarget.style.borderColor = "#1e293b";
            }}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "5px",
              fontSize: 10,
              background: "transparent",
              color: "#475569",
              border: "1px dashed #1e293b",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Drop or click to upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) onUploadFiles(deal.deal_id, files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </>
      )}
    </div>
  );
}
