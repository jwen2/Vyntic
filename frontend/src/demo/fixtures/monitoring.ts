import type {
  CallNotice,
  Obligation,
  PortfolioCallNotice,
  PortfolioObligation,
  PortfolioPosition,
  Position,
} from "@/lib/api";
import { DemoRefusal, registerDemoRoutes } from "@/demo/transport";
import { DEMO_DEALS, DEMO_FUND_III_ID } from "./entities";

/**
 * Monitoring and portfolio reads.
 *
 * Split deliberately along what the product *stores* versus what its model
 * *produces*:
 *
 *  - A position is structured data an LP records — commitment, called,
 *    distributed, NAV. `Position` carries no citations
 *    (`backend/app/models/manager.py:28`), because it asserts nothing; it is a
 *    number the LP keeps. So it can be fixtured from the corpus directly.
 *  - Call notices and side-letter obligations carry `citations` and are
 *    extraction output. Hand-writing them would be inventing findings and
 *    attributing them to the product — the exact failure the Task 7 review
 *    caught. They stay empty here until a real run is recorded, the same way
 *    the DDQ scan centrepiece was produced.
 *
 * An empty notice queue is not a lie: it is what the product shows an LP who
 * has not run an extraction yet, and the Extract button is right there saying
 * so when clicked. A red `ApiError` band on arrival, which is what these
 * surfaces rendered before, is not a state the product has at all.
 */

/**
 * Glenmoor's Fund III position, as of the Q2 2026 capital account statement.
 *
 * Every figure is read from `glenmoor_fund_iii_pcap_q2_2026.pdf` p.1, the
 * document a visitor can open from this workspace — commitment $25,000,000,
 * paid-in $18,750,000, cumulative distributions $6,200,000, NAV $21,400,000,
 * as of June 30, 2026. Nothing here is derived or rounded.
 *
 * `has_notices` is false because no notice has been extracted, which is what
 * makes called/distributed the stored figures rather than computed ones.
 */
const FUND_III_POSITION: Position = {
  deal_id: DEMO_FUND_III_ID,
  commitment_amount: 25_000_000,
  currency: "USD",
  opening_called: null,
  opening_distributed: null,
  called_amount: 18_750_000,
  distributed_amount: 6_200_000,
  nav: 21_400_000,
  as_of: "2026-06-30",
  status: "active",
  has_notices: false,
};

/** Mirrors the backend's `Position(deal_id=...)` default for a fund with no
 * position recorded — Fund IV is under diligence, not committed to. */
function emptyPosition(dealId: string): Position {
  return {
    deal_id: dealId,
    commitment_amount: null,
    currency: "USD",
    opening_called: null,
    opening_distributed: null,
    called_amount: null,
    distributed_amount: null,
    nav: null,
    as_of: null,
    status: "active",
    has_notices: false,
  };
}

export function demoPosition(dealId: string): Position {
  return dealId === DEMO_FUND_III_ID ? FUND_III_POSITION : emptyPosition(dealId);
}

/**
 * The portfolio board lists every fund, positioned or not, and computes
 * `unfunded` as commitment − called (`routes_monitoring.py:240`) rather than
 * storing it.
 *
 * That arithmetic is why the board reads $6,250,000 unfunded and not the
 * $4,375,000 the capital-call notice quotes: the position is as of June 30,
 * and Capital Call No. 7 is dated July 22. The call has not been applied
 * because it has not been extracted. Both figures are correct as of their own
 * date, and the gap is the monitoring loop the product exists to close.
 */
export function demoPortfolioPositions(): PortfolioPosition[] {
  return DEMO_DEALS.map((deal) => {
    const position = demoPosition(deal.deal_id);
    const { commitment_amount, called_amount } = position;
    return {
      deal_id: deal.deal_id,
      fund_name: deal.name,
      manager_id: deal.manager_id,
      manager_name: deal.manager_name,
      commitment_amount,
      called_amount,
      distributed_amount: position.distributed_amount,
      nav: position.nav,
      unfunded:
        commitment_amount !== null && called_amount !== null
          ? commitment_amount - called_amount
          : null,
      currency: position.currency,
      as_of: position.as_of,
    };
  });
}

/** Awaiting a recorded extraction run — see the module note. */
const NO_NOTICES: CallNotice[] = [];
const NO_OBLIGATIONS: Obligation[] = [];
const NO_PORTFOLIO_NOTICES: PortfolioCallNotice[] = [];
const NO_PORTFOLIO_OBLIGATIONS: PortfolioObligation[] = [];

/**
 * Every extraction here is a live model call per document. The demo serves
 * recorded output, so it says that rather than fabricating a result — an
 * invented capital call carries an amount and a due date a prospect would
 * reasonably act on.
 */
const EXTRACTION_REFUSAL =
  "Extraction runs a live model pass over the document. This demo serves " +
  "recorded output only, so it isn't wired here — the recorded work is the " +
  "DDQ gap-and-consistency scan under Workflows in Brightwater Capital " +
  "Partners IV.";

/** Writes land nowhere: the demo has no store behind it, and a save that
 * silently vanished on reload reads as data loss rather than as a boundary. */
const SAVE_REFUSAL =
  "This demo is read-only — it serves a fixed, pre-ingested corpus, so " +
  "there's nothing to save changes to. In the live product this would persist " +
  "against the fund's record.";

function refuse(message: string): never {
  throw new DemoRefusal(message);
}

export function registerMonitoringFixtures(): void {
  registerDemoRoutes([
    // ── Reads ──
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/position$/,
      handler: (m) => demoPosition(m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/[^/]+\/call-notices$/,
      handler: () => NO_NOTICES,
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/[^/]+\/side-letters\/obligations$/,
      handler: () => NO_OBLIGATIONS,
    },
    {
      method: "GET",
      pattern: /^\/api\/portfolio\/positions$/,
      handler: () => demoPortfolioPositions(),
    },
    {
      method: "GET",
      pattern: /^\/api\/portfolio\/call-notices$/,
      handler: () => NO_PORTFOLIO_NOTICES,
    },
    {
      method: "GET",
      pattern: /^\/api\/portfolio\/compliance$/,
      handler: () => NO_PORTFOLIO_OBLIGATIONS,
    },

    // ── Writes: refused in the product's own words ──
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/call-notices\/extract$/,
      handler: () => refuse(EXTRACTION_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/side-letters\/extract$/,
      handler: () => refuse(EXTRACTION_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/side-letters\/verify$/,
      handler: () => refuse(EXTRACTION_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/call-notices$/,
      handler: () => refuse(SAVE_REFUSAL),
    },
    {
      method: "PATCH",
      pattern: /^\/api\/deals\/[^/]+\/call-notices\/[^/]+$/,
      handler: () => refuse(SAVE_REFUSAL),
    },
    {
      method: "POST",
      pattern: /^\/api\/deals\/[^/]+\/side-letters\/obligations$/,
      handler: () => refuse(SAVE_REFUSAL),
    },
    {
      method: "PATCH",
      pattern: /^\/api\/deals\/[^/]+\/side-letters\/checks\/[^/]+$/,
      handler: () => refuse(SAVE_REFUSAL),
    },
    {
      method: "PUT",
      pattern: /^\/api\/deals\/[^/]+\/position$/,
      handler: () => refuse(SAVE_REFUSAL),
    },
    {
      method: "PATCH",
      pattern: /^\/api\/deals\/[^/]+\/documents\/[^/]+\/metadata$/,
      handler: () => refuse(SAVE_REFUSAL),
    },
  ]);
}
