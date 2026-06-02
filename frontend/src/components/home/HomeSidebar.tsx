import { Deal, UploadProgress, User } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import DealListItem from "./DealListItem";

interface Props {
  deals: Deal[];
  filteredDeals: Deal[];
  selectedDealId?: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelectDeal?: (deal: Deal) => void;
  onInvestigateDeal?: (deal: Deal) => void;
  onDeleteDeal: (deal: Deal) => void;
  onUploadFiles: (dealId: string, files: File[]) => void;
  onUpdateDeal: (
    dealId: string,
    data: { stage?: string; tags?: string[] }
  ) => void;
  uploading: boolean;
  uploadProgressByDeal?: Record<string, UploadProgress>;
  user: User | null;
  onClose?: () => void;
}

export default function HomeSidebar({
  deals,
  filteredDeals,
  selectedDealId,
  search,
  onSearch,
  onSelectDeal,
  onInvestigateDeal,
  onDeleteDeal,
  onUploadFiles,
  onUpdateDeal,
  uploading,
  uploadProgressByDeal = {},
  user,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const surface = isDark ? "#151515" : "#f8f8f4";
  const surfaceAlt = isDark ? "#101010" : "#ffffff";
  const border = isDark ? "#262626" : "var(--landing-border)";
  const text = isDark ? "#f5f5f5" : "var(--landing-text)";
  const muted = isDark ? "rgba(255,255,255,0.58)" : "var(--landing-muted)";

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{
        width: 320,
        flexShrink: 0,
        background: surface,
        borderRight: `1px solid ${border}`,
      }}
    >
      <div className="border-b px-4 py-4" style={{ borderBottomColor: border }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div
              className="font-mono-plex"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: muted,
              }}
            >
              Active pipeline
            </div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color: text }}>
              Deals
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: muted }}>
              Review active opportunities and switch the matrix context quickly.
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border lg:hidden"
              style={{
                borderColor: border,
                color: text,
                background: surfaceAlt,
              }}
              aria-label="Close deals panel"
            >
              ×
            </button>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${border}`,
              background: surfaceAlt,
            }}
          >
            <div
              className="font-mono-plex"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: muted,
              }}
            >
              Total
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: text }}>{deals.length}</div>
          </div>
        </div>
      </div>

      <div className="border-b px-4 py-4" style={{ borderBottomColor: border }}>
        <div style={{ position: "relative" }}>
          <svg
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 14,
              height: 14,
              color: muted,
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search deals"
            className="w-full rounded-2xl border px-11 py-3 text-sm outline-none"
            style={{
              background: surfaceAlt,
              borderColor: border,
              color: text,
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: muted,
                cursor: "pointer",
                fontSize: 13,
              }}
              aria-label="Clear deal search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="dd-scroll flex-1 overflow-y-auto px-3 py-3">
        {filteredDeals.length === 0 ? (
          <div
            className="rounded-[1.5rem] border px-4 py-5 text-center"
            style={{
              borderColor: border,
              background: surfaceAlt,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: text }}>
              {search ? "No matching deals" : "No deals yet"}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: muted }}>
              {search
                ? "Try another name or clear the current search."
                : user?.is_admin
                  ? "Use Add deal in the top bar to create the first workspace."
                  : "Your administrator can create a workspace to get started."}
            </div>
          </div>
        ) : (
          filteredDeals.map((deal) => (
            <DealListItem
              key={deal.deal_id}
              deal={deal}
              selected={deal.deal_id === selectedDealId}
              onSelect={
                onSelectDeal
                  ? () => {
                      onSelectDeal(deal);
                      onClose?.();
                    }
                  : undefined
              }
              onInvestigate={
                onInvestigateDeal ? () => onInvestigateDeal(deal) : undefined
              }
              onDelete={() => onDeleteDeal(deal)}
              onUploadFiles={onUploadFiles}
              onUpdateDeal={onUpdateDeal}
              uploading={uploading && Boolean(uploadProgressByDeal[deal.deal_id])}
              uploadProgress={uploadProgressByDeal[deal.deal_id]}
              readOnly={!user?.is_admin}
            />
          ))
        )}
      </div>

      <div
        className="border-t px-4 py-4"
        style={{
          borderTopColor: border,
          background: surfaceAlt,
        }}
      >
        <div
          className="font-mono-plex"
          style={{
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: muted,
          }}
        >
          How it works
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: "12px 0 0",
            fontSize: 12,
            color: muted,
            lineHeight: 1.65,
          }}
        >
          <li>Each deal stays isolated in its own document namespace.</li>
          <li>Questions fan out across uploaded documents.</li>
          <li>Citations keep answers reviewable before committee use.</li>
        </ul>
      </div>
    </aside>
  );
}
