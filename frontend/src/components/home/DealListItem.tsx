import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Deal, UploadProgress, stagesForEntity } from "@/lib/api";
import { stageBadge } from "@/lib/stageBadges";
import { toneVars, type BadgeTone } from "@/lib/badgePalette";
import Button from "@/components/ui/Button";

// Sector tags route through the curated badge palette (lib/badgePalette.ts) —
// same theme-aware CSS vars as stage chips, so there's no separate light/dark
// map to keep in sync. Hue picked per sector to stay close to its pre-reskin
// assignment (see the retired SECTOR_STYLES this replaced); each of the 8
// tones is used exactly once so no two sector chips ever read identically.
// Unknown tags fall back to the neutral chip.
const SECTOR_TONES: Record<string, BadgeTone> = {
  Technology: "slate",
  Healthcare: "oxblood",
  Industrials: "teal",
  Consumer: "plum",
  "Financial Services": "sage",
  Energy: "ochre",
  "Real Estate": "clay",
  Infrastructure: "moss",
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
          const tone = SECTOR_TONES[tag];
          const sector = tone ? toneVars(tone) : null;
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
                  ? sector.edge
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
