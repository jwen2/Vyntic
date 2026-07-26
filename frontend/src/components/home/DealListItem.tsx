import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/components/ThemeProvider";
import { Deal, UploadProgress, stagesForEntity } from "@/lib/api";
import { stageBadge } from "@/lib/stageBadges";
import Button from "@/components/ui/Button";

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
  onUpdateDeal,
  uploading,
  uploadProgress,
  readOnly,
}: Props) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [hovered, setHovered] = useState(false);
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);

  const surface = "var(--surface)";
  const surfaceAlt = "var(--surface-alt)";
  const border = "var(--border)";
  const text = "var(--text-1)";
  const muted = "var(--text-3)";
  // Selection = accent tint wash + accent border (same idiom as the workspace);
  // text stays at normal contrast on the wash, so no inverse overrides needed.
  const selectedBg = "var(--accent-tint)";
  const sectorMap = isDark ? DARK_SECTOR_STYLES : SECTOR_STYLES;
  const badge = stageBadge(deal.stage);
  const stage =
    badge || {
      bg: surfaceAlt,
      fg: text,
      border,
    };

  const cardBackground = selected
    ? selectedBg
    : hovered
      ? surfaceAlt
      : surface;
  const cardText = text;
  const cardMuted = muted;
  const cardBorder = selected ? "var(--accent)" : border;
  const selectDeal = () => {
    if (onSelect) onSelect();
    else navigate(`/deal/${deal.deal_id}`);
  };
  const openAnalyzeFromName = deal.entity_type === "fund";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="mb-2 rounded-lg border p-3 transition-colors"
      style={{
        background: cardBackground,
        borderColor: cardBorder,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={
              openAnalyzeFromName
                ? () => navigate(`/deal/${deal.deal_id}`)
                : selectDeal
            }
            aria-label={
              openAnalyzeFromName
                ? `Analyze ${deal.name}`
                : `Select ${deal.name}`
            }
            title={
              openAnalyzeFromName
                ? `Open ${deal.name} in Analyze`
                : deal.name
            }
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: 0,
              background: "transparent",
              border: "none",
              textAlign: "left",
              fontSize: 14,
              fontWeight: 600,
              color: cardText,
              lineHeight: 1.3,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textDecoration:
                  openAnalyzeFromName && hovered ? "underline" : "none",
                textUnderlineOffset: 3,
              }}
            >
              {deal.name}
            </span>
            {openAnalyzeFromName && (
              <span aria-hidden="true" style={{ flexShrink: 0, color: cardMuted }}>
                →
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={selectDeal}
            aria-label={`Select ${deal.name} for document matrix`}
            className="font-mono-plex"
            style={{
              display: "block",
              width: "100%",
              padding: 0,
              background: "transparent",
              border: "none",
              textAlign: "left",
              cursor: "pointer",
              marginTop: 4,
              fontSize: 10,
              color: cardMuted,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {deal.deal_id} · {deal.document_count} doc{deal.document_count !== 1 ? "s" : ""}
            {deal.entity_type === "fund" && deal.vintage ? ` · ${deal.vintage}` : ""}
            {deal.entity_type === "fund" && deal.strategy ? ` · ${deal.strategy}` : ""}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onInvestigate && (
            <Button
              variant={selected ? "primary" : "secondary"}
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onInvestigate();
              }}
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Analyze
            </Button>
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <div style={{ position: "relative" }}>
          {readOnly ? (
            <span
              className="font-mono-plex rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.08em]"
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
                className="font-mono-plex rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.08em]"
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
              className="rounded-md border px-2 py-1 text-[11px]"
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

        {!readOnly && hovered && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => {
                setShowTagMenu((value) => !value);
                setShowStageMenu(false);
              }}
              className="font-mono-plex rounded-md border border-dashed px-2 py-1 text-[10px] uppercase tracking-[0.08em]"
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

      {(uploading || uploadProgress) && (
        <div className="mt-3">
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
                    ? "var(--danger)"
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
                    ? "var(--danger)"
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
