import { Deal, UploadProgress, User } from "@/lib/api";
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
}: Props) {
  return (
    <div
      className="flex flex-col dd-scroll"
      style={{
        width: 272,
        flexShrink: 0,
        background: "#0f172a",
        borderRight: "1px solid #1e293b",
        overflow: "hidden",
      }}
    >
      {/* Tab strip header */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: "1px solid #1e293b" }}
      >
        <div
          className="flex items-center justify-center gap-1.5"
          style={{
            flex: 1,
            padding: "9px 6px",
            fontSize: 12,
            fontWeight: 600,
            color: "#f1f5f9",
            borderBottom: "2px solid #3b82f6",
          }}
        >
          Active Deals
          <span
            style={{
              padding: "1px 5px",
              borderRadius: 99,
              background: "#1e293b",
              color: "#94a3b8",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {deals.length}
          </span>
        </div>
      </div>

      {/* Search */}
      <div
        style={{ padding: "10px 12px", borderBottom: "1px solid #1e293b" }}
      >
        <div style={{ position: "relative" }}>
          <svg
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 13,
              height: 13,
              color: "#475569",
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
            placeholder="Search deals..."
            style={{
              width: "100%",
              padding: "5px 26px 5px 26px",
              fontSize: 11,
              background: "#020617",
              color: "#e2e8f0",
              border: "1px solid #1e293b",
              borderRadius: 5,
              outline: "none",
            }}
          />
          {search && (
            <button
              onClick={() => onSearch("")}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Deal list */}
      <div
        className="flex-1 overflow-y-auto dd-scroll"
        style={{ padding: 8 }}
      >
        {filteredDeals.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
              {search ? "No matching deals" : "No deals yet"}
            </div>
            {!search && user?.is_admin && (
              <div
                style={{
                  fontSize: 11,
                  color: "#334155",
                  lineHeight: 1.5,
                }}
              >
                Click <strong style={{ color: "#475569" }}>+ Add Deal</strong>{" "}
                in the top bar to start.
              </div>
            )}
          </div>
        ) : (
          filteredDeals.map((deal) => (
            <DealListItem
              key={deal.deal_id}
              deal={deal}
              selected={deal.deal_id === selectedDealId}
              onSelect={onSelectDeal ? () => onSelectDeal(deal) : undefined}
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

      {/* Footer info card */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid #1e293b",
          background: "#020617",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#475569",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 6,
          }}
        >
          How it works
        </div>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            fontSize: 10,
            color: "#64748b",
            lineHeight: 1.55,
          }}
        >
          <li style={{ marginBottom: 3 }}>
            · Each deal is isolated in its own vector namespace
          </li>
          <li style={{ marginBottom: 3 }}>
            · Queries fan out to worker agents per deal
          </li>
          <li style={{ marginBottom: 3 }}>
            · A synthesis agent compares results
          </li>
          <li>· Zero context leak between deals</li>
        </ul>
      </div>
    </div>
  );
}
