import { useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/components/ThemeProvider";
import { Deal, UploadProgress, stagesForEntity } from "@/lib/api";
import { STAGE_STYLES, DARK_STAGE_STYLES } from "@/lib/stageBadges";

// Sector tags carry fixed hues (same contrast targets as the stage chips);
// hues were picked to stay clear of the stage set so a card row never shows
// two near-identical chips. Unknown tags fall back to the neutral chip.
const SECTOR_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  Technology: { bg: "#e1edfa", fg: "#1b4d7e", border: "#7099c2" },
  Healthcare: { bg: "#f8e2e7", fg: "#822638", border: "#b87a87" },
  Industrials: { bg: "#e9eef2", fg: "#3a4d59", border: "#839daf" },
  Consumer: { bg: "#f8e3f2", fg: "#7d2667", border: "#b67ca7" },
  "Financial Services": { bg: "#e3f7ed", fg: "#1d583b", border: "#70a98c" },
  Energy: { bg: "#faf5e1", fg: "#5d4e14", border: "#b19b43" },
  "Real Estate": { bg: "#f9e7e2", fg: "#7a361f", border: "#bd8775" },
  Infrastructure: { bg: "#eef5e5", fg: "#3f5223", border: "#8ea470" },
};

const DARK_SECTOR_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  Technology: { bg: "#151c23", fg: "#89add2", border: "#2c3844" },
  Healthcare: { bg: "#231518", fg: "#d897a4", border: "#442c31" },
  Industrials: { bg: "#151d23", fg: "#85b1d1", border: "#2c3a44" },
  Consumer: { bg: "#231520", fg: "#d694c6", border: "#442c3e" },
  "Financial Services": { bg: "#15231c", fg: "#5cc18f", border: "#2c4438" },
  Energy: { bg: "#232015", fg: "#c3af60", border: "#44402c" },
  "Real Estate": { bg: "#231915", fg: "#d49e8c", border: "#44322c" },
  Infrastructure: { bg: "#1d2315", fg: "#95c059", border: "#3a442c" },
};
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
  // Selection = accent tint wash + accent border (same idiom as the workspace);
  // text stays at normal contrast on the wash, so no inverse overrides needed.
  const selectedBg = "var(--accent-tint)";
  const stageMap = isDark ? DARK_STAGE_STYLES : STAGE_STYLES;
  const sectorMap = isDark ? DARK_SECTOR_STYLES : SECTOR_STYLES;
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
  const cardText = text;
  const cardMuted = muted;
  const cardBorder = dragging
    ? isDark
      ? "#3a3a3a"
      : "#bdbdb3"
    : selected
      ? "var(--accent)"
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
            {deal.entity_type === "fund" && deal.vintage ? ` · ${deal.vintage}` : ""}
            {deal.entity_type === "fund" && deal.strategy ? ` · ${deal.strategy}` : ""}
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
                borderColor: selected ? "var(--accent)" : border,
                background: selected ? "var(--accent)" : surfaceAlt,
                color: selected ? "var(--on-accent)" : cardText,
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
                  {stagesForEntity(deal.entity_type).map((stageName) => (
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

        {deal.tags.map((tag) => {
          const sector = sectorMap[tag];
          return (
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
                background: sector ? sector.bg : selected ? "transparent" : surfaceAlt,
                color: sector ? sector.fg : cardMuted,
                borderColor: sector
                  ? sector.border
                  : selected
                    ? "var(--accent-tint-border)"
                    : border,
                cursor: readOnly ? "default" : "pointer",
              }}
            >
              {tag}
            </button>
          );
        })}

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
                borderColor: selected ? "var(--accent-tint-border)" : border,
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
            borderColor: selected ? "var(--accent-tint-border)" : border,
            color: cardMuted,
            background: selected ? "transparent" : surfaceAlt,
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
                color:
                  uploadProgress?.status === "error"
                    ? isDark
                      ? "#f87171"
                      : "#dc2626"
                    : cardMuted,
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
              background: surfaceAlt,
              border: `1px solid ${selected ? "var(--accent-tint-border)" : border}`,
            }}
          >
            <div
              style={{
                width: `${uploadProgress?.percent ?? 12}%`,
                height: "100%",
                borderRadius: 999,
                background:
                  uploadProgress?.status === "error"
                    ? isDark
                      ? "#f87171"
                      : "#dc2626"
                    : "var(--accent)",
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
              borderColor: selected ? "var(--accent-tint-border)" : border,
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
        background: active ? "var(--accent-tint)" : "transparent",
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
