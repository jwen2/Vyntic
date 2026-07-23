import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Deal, UploadProgress, User } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import DealListItem from "./DealListItem";

/** Group funds under their manager; plain deals form a trailing group. */
function groupByManager(deals: Deal[]): { label: string | null; managerId: string | null; deals: Deal[] }[] {
  const managerGroups = new Map<string, { label: string; deals: Deal[] }>();
  const plainDeals: Deal[] = [];
  const orphanFunds: Deal[] = [];

  for (const deal of deals) {
    if (deal.entity_type === "fund" && deal.manager_id) {
      const existing = managerGroups.get(deal.manager_id);
      if (existing) {
        existing.deals.push(deal);
      } else {
        managerGroups.set(deal.manager_id, {
          label: deal.manager_name || deal.manager_id,
          deals: [deal],
        });
      }
    } else if (deal.entity_type === "fund") {
      orphanFunds.push(deal);
    } else {
      plainDeals.push(deal);
    }
  }

  const groups: { label: string | null; managerId: string | null; deals: Deal[] }[] = [...managerGroups.entries()]
    .map(([managerId, group]) => ({ ...group, managerId }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (orphanFunds.length > 0) groups.push({ label: "Unassigned funds", managerId: null, deals: orphanFunds });
  // Plain deals render without a group header unless funds exist alongside them.
  if (plainDeals.length > 0) {
    groups.push({ label: groups.length > 0 ? "Deals" : null, managerId: null, deals: plainDeals });
  }
  return groups;
}

interface Props {
  deals: Deal[];
  filteredDeals: Deal[];
  selectedDealId?: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelectDeal?: (deal: Deal) => void;
  onInvestigateDeal?: (deal: Deal) => void;
  onDeleteDeal: (deal: Deal) => void;
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
  onUpdateDeal,
  uploading,
  uploadProgressByDeal = {},
  user,
  onClose,
}: Props) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const groups = useMemo(() => groupByManager(filteredDeals), [filteredDeals]);
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
      <div className="border-b px-4 py-3" style={{ borderBottomColor: border }}>
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
              Pipeline
            </div>
            <div style={{ marginTop: 4, fontSize: 20, fontWeight: 600, color: text }}>
              Deals
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: muted }}>
              {deals.length} total
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border lg:hidden"
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

      </div>

      <div className="border-b px-4 py-3" style={{ borderBottomColor: border }}>
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
            className="w-full rounded-lg border px-10 py-2.5 text-sm outline-none"
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
            className="rounded-lg border px-4 py-5 text-center"
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
          groups.map((group, groupIndex) => (
            <div key={`${group.label ?? "__ungrouped__"}-${groupIndex}`}>
              {group.label && (
                <button
                  type="button"
                  onClick={group.managerId ? () => {
                    navigate(`/manager/${encodeURIComponent(group.managerId!)}`);
                    onClose?.();
                  } : undefined}
                  className="font-mono-plex px-2 uppercase"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    color: muted,
                    marginTop: groupIndex === 0 ? 4 : 16,
                    marginBottom: 8,
                    cursor: group.managerId ? "pointer" : "default",
                  }}
                >
                  {group.label}{group.managerId ? "  →" : ""}
                </button>
              )}
              {group.deals.map((deal) => (
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
                  onUpdateDeal={onUpdateDeal}
                  uploading={uploading && Boolean(uploadProgressByDeal[deal.deal_id])}
                  uploadProgress={uploadProgressByDeal[deal.deal_id]}
                  readOnly={!user?.is_admin}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
