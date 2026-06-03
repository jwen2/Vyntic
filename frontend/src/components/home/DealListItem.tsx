import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/components/ThemeProvider";
import { Deal, UploadProgress } from "@/lib/api";

const STAGE_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  Screening: { bg: "#f1f1ec", fg: "#5a5a54", border: "#d6d6cc" },
  "Due Diligence": { bg: "#e6e6df", fg: "#3f3f3a", border: "#d0d0c6" },
  "IC Review": { bg: "#dcdcd2", fg: "#252525", border: "#c9c9bf" },
  Closed: { bg: "#111111", fg: "#ffffff", border: "#111111" },
};

const DARK_STAGE_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  Screening: { bg: "#1a1a1a", fg: "rgba(255,255,255,0.72)", border: "#2d2d2d" },
  "Due Diligence": { bg: "#202020", fg: "#f5f5f5", border: "#303030" },
  "IC Review": { bg: "#262626", fg: "#ffffff", border: "#343434" },
  Closed: { bg: "#f5f5f5", fg: "#111111", border: "#f5f5f5" },
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
  uploadProgress?: UploadProgress;
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
  uploadProgress,
  readOnly,
}: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const surface = isDark ? "#151515" : "#ffffff";
  const surfaceAlt = isDark ? "#101010" : "#f8f8f4";
  const border = isDark ? "#262626" : "var(--landing-border)";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
  const muted = isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)";
  const selectedBg = isDark ? "#202020" : "#111111";
  const selectedText = isDark ? "#ffffff" : "#ffffff";
  const selectedMuted = isDark ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.68)";
  const stageMap = isDark ? DARK_STAGE_STYLES : STAGE_STYLES;
  const stage =
    stageMap[deal.stage] || {
      bg: surfaceAlt,
      fg: text,
      border,
    };

  const cardBackground = dragging
    ? isDark
      ? "#1c1c1c"
      : "#efefe7"
    : selected
      ? selectedBg
      : hovered
        ? surfaceAlt
        : surface;
  const cardText = selected ? selectedText : text;
  const cardMuted = selected ? selectedMuted : muted;
  const cardBorder = dragging
    ? isDark
      ? "#3a3a3a"
      : "#bdbdb3"
    : selected
      ? selectedBg
      : border;

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
      (f) => f.name.endsWith(".pdf") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
    );
    if (files.length > 0) onUploadFiles(deal.deal_id, files);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragEnter={readOnly ? undefined : handleDragEnter}
      onDragLeave={readOnly ? undefined : handleDragLeave}
      onDragOver={readOnly ? undefined : handleDragOver}
      onDrop={readOnly ? undefined : handleDrop}
      className="mb-3 rounded-[1.35rem] border p-4 transition-colors"
      style={{
        background: cardBackground,
        borderColor: cardBorder,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            if (onSelect) onSelect();
            else navigate(`/deal/${deal.deal_id}`);
          }}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            textAlign: "left",
            flex: 1,
            minWidth: 0,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: cardText,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={deal.name}
          >
            {deal.name}
          </div>
          <div
            className="font-mono-plex"
            style={{
              fontSize: 10,
              color: cardMuted,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {deal.deal_id} · {deal.document_count} doc{deal.document_count !== 1 ? "s" : ""}
          </div>
        </button>

        <div className="flex items-center gap-2">
          {onInvestigate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onInvestigate();
              }}
              className="rounded-full border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.12em]"
              style={{
                borderColor: selected ? "rgba(255,255,255,0.2)" : border,
                background: selected ? "rgba(255,255,255,0.08)" : surfaceAlt,
                color: selected ? selectedText : cardText,
              }}
            >
              Analyze
            </button>
          )}
          {!readOnly && hovered && (
            <button
              type="button"
              onClick={onDelete}
              style={{
                border: "none",
                background: "transparent",
                color: cardMuted,
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
              aria-label={`Delete ${deal.name}`}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div style={{ position: "relative" }}>
          {readOnly ? (
            <span
              className="font-mono-plex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em]"
              style={{
                background: stage.bg,
                color: stage.fg,
                borderColor: stage.border,
              }}
            >
              {deal.stage}
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowStageMenu((value) => !value);
                  setShowTagMenu(false);
                }}
                className="font-mono-plex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.12em]"
                style={{
                  background: stage.bg,
                  color: stage.fg,
                  borderColor: stage.border,
                }}
              >
                {deal.stage}
              </button>
              {showStageMenu && (
                <Menu surface={surface} border={border} text={text}>
                  {STAGES.map((stageName) => (
                    <MenuItem
                      key={stageName}
                      label={stageName}
                      active={stageName === deal.stage}
                      onClick={() => {
                        onUpdateDeal(deal.deal_id, { stage: stageName });
                        setShowStageMenu(false);
                      }}
                    />
                  ))}
                </Menu>
              )}
            </>
          )}
        </div>

        {deal.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            title={readOnly ? undefined : `Remove ${tag}`}
            onClick={
              readOnly
                ? undefined
                : () =>
                    onUpdateDeal(deal.deal_id, {
                      tags: deal.tags.filter((t) => t !== tag),
                    })
            }
            className="rounded-full border px-3 py-1 text-[11px]"
            style={{
              background: selected ? "rgba(255,255,255,0.08)" : surfaceAlt,
              color: cardMuted,
              borderColor: selected ? "rgba(255,255,255,0.14)" : border,
              cursor: readOnly ? "default" : "pointer",
            }}
          >
            {tag}
          </button>
        ))}

        {!readOnly && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setShowTagMenu((value) => !value);
                setShowStageMenu(false);
              }}
              className="font-mono-plex rounded-full border border-dashed px-3 py-1 text-[10px] uppercase tracking-[0.12em]"
              style={{
                background: "transparent",
                color: cardMuted,
                borderColor: selected ? "rgba(255,255,255,0.18)" : border,
              }}
            >
              Add tag
            </button>
            {showTagMenu && (
              <Menu surface={surface} border={border} text={text} width={180}>
                {SECTOR_TAGS.filter((tag) => !deal.tags.includes(tag)).map((tag) => (
                  <MenuItem
                    key={tag}
                    label={tag}
                    onClick={() => {
                      onUpdateDeal(deal.deal_id, {
                        tags: [...deal.tags, tag],
                      });
                      setShowTagMenu(false);
                    }}
                  />
                ))}
              </Menu>
            )}
          </div>
        )}
      </div>

      {dragging && (
        <div
          className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-center text-sm"
          style={{
            borderColor: selected ? "rgba(255,255,255,0.3)" : border,
            color: cardMuted,
            background: selected ? "rgba(255,255,255,0.06)" : surfaceAlt,
          }}
        >
          Drop PDF or Excel files here
        </div>
      )}

      {(uploading || uploadProgress) && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span
              className="font-mono-plex"
              title={uploadProgress?.detail || uploadProgress?.filename || ""}
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: cardMuted,
              }}
            >
              {uploadProgress?.stage || "Indexing"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: cardText }}>
              {uploadProgress ? `${uploadProgress.percent}%` : ""}
            </span>
          </div>
          <div
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress?.percent ?? 0}
            role="progressbar"
            style={{
              height: 7,
              width: "100%",
              overflow: "hidden",
              borderRadius: 999,
              background: selected ? "rgba(255,255,255,0.08)" : surfaceAlt,
              border: `1px solid ${selected ? "rgba(255,255,255,0.1)" : border}`,
            }}
          >
            <div
              style={{
                width: `${uploadProgress?.percent ?? 12}%`,
                height: "100%",
                borderRadius: 999,
                background:
                  uploadProgress?.status === "error"
                    ? "#7a7a7a"
                    : uploadProgress?.status === "complete"
                      ? isDark
                        ? "#f5f5f5"
                        : "#111111"
                      : isDark
                        ? "#bbbbbb"
                        : "#444444",
                transition: "width .25s ease",
              }}
            />
          </div>
          {uploadProgress?.detail && (
            <div
              title={uploadProgress.detail}
              style={{
                marginTop: 6,
                fontSize: 11,
                color: cardMuted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {uploadProgress.detail}
            </div>
          )}
        </div>
      )}

      {!readOnly && !dragging && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 w-full rounded-2xl border border-dashed px-4 py-3 text-sm"
            style={{
              background: "transparent",
              color: cardMuted,
              borderColor: selected ? "rgba(255,255,255,0.18)" : border,
            }}
          >
            Drop files here or click to upload
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

function Menu({
  children,
  surface,
  border,
  text,
  width = 150,
}: {
  children: React.ReactNode;
  surface: string;
  border: string;
  text: string;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        width,
        padding: 6,
        borderRadius: 18,
        background: surface,
        border: `1px solid ${border}`,
        boxShadow: "0 18px 40px rgba(0,0,0,0.08)",
        zIndex: 30,
        color: text,
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  active = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        background: active ? "rgba(17,17,17,0.06)" : "transparent",
        color: "inherit",
        border: "none",
        borderRadius: 12,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}
