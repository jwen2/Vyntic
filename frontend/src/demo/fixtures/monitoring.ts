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
import recorded from "./recorded-monitoring.json";

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
 *    caught. They are therefore *recorded* from a real run, the same way the
 *    DDQ scan centrepiece was.
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

/**
 * Recorded 2026-08-05 against the real backend and a real model: extract on
 * `brightwater_iii_capital_call_07.pdf` and `..._distribution_03.pdf`, extract
 * on `glenmoor_fund_iii_side_letter.pdf`, persist, then verify against the
 * Q2 2026 reporting package. Frozen verbatim — recording rather than authoring
 * is what makes its 43 citations correct by construction (each was checked to
 * appear on the page it names).
 *
 * READ THE VERDICTS BEFORE CHANGING ANYTHING HERE. The corpus was built with a
 * 45-day quarterly-reporting breach as its planted finding, and the model did
 * NOT call it a breach: it returned `unclear`, reasoning that the report is
 * *dated* August 29 but the documents never say when it was *delivered*, so the
 * 45-day clock cannot be verified. That is a defensible reading of an
 * obligation about provision, and it is what the product actually says.
 * Upgrading it to `breach` would be hand-writing a finding the model declined
 * to make — the single thing this track has ruled out most firmly.
 */
const recording = recorded as unknown as {
  notices: CallNotice[];
  obligations: Obligation[];
};

/**
 * The one edit to the recording, applied here rather than in the JSON so the
 * file stays exactly as the model produced it.
 *
 * `due_date` came back as "2026-07-27 [Source 1]" — the citation marker leaked
 * out of the prose fields into a date field. Prose keeps its markers, because
 * that is how this product cites; a date must be a date. The evidence is not
 * lost: the same citation is in the notice's `citations` array, which is what
 * the UI links. (The leak is a real extractor defect, logged for the backend.)
 */
const SOURCE_MARKER = /\s*(\[Source \d+\])+\s*$/;

function withCleanDueDate(notice: CallNotice): CallNotice {
  if (!notice.due_date) return notice;
  const cleaned = notice.due_date.replace(SOURCE_MARKER, "");
  if (cleaned === notice.due_date) return notice;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    // Loud rather than silent: a re-recording that changes the shape of this
    // field must not quietly ship a malformed date into the demo.
    throw new Error(`demo: unexpected due_date in recording: ${notice.due_date}`);
  }
  return { ...notice, due_date: cleaned };
}

const DEMO_NOTICES: CallNotice[] = recording.notices.map(withCleanDueDate);
const DEMO_OBLIGATIONS: Obligation[] = recording.obligations;

/** Annotates with fund/manager labels the way the portfolio routes do
 *  (`routes_monitoring.py:222,265`) — from the demo's own deal list, so no
 *  entity outside the demo can ever appear on the board. */
function fundLabels(dealId: string) {
  const deal = DEMO_DEALS.find((d) => d.deal_id === dealId);
  return {
    fund_name: deal?.name ?? dealId,
    manager_id: deal?.manager_id ?? null,
    manager_name: deal?.manager_name ?? null,
  };
}

export function demoPortfolioNotices(): PortfolioCallNotice[] {
  return DEMO_NOTICES.map((notice) => ({ ...notice, ...fundLabels(notice.deal_id) }));
}

/** The compliance card shows obligations whose latest check is a breach or is
 *  unclear (`side_letter_store.list_flagged`) — six of the seven here. */
export function demoPortfolioCompliance(): PortfolioObligation[] {
  return DEMO_OBLIGATIONS.filter(
    (o) => o.latest_check && o.latest_check.verdict !== "compliant"
  ).map((o) => ({ ...o, ...fundLabels(o.deal_id) }));
}

/** Fund III carries the recorded monitoring work; Fund IV is pre-commitment. */
function noticesFor(dealId: string): CallNotice[] {
  return dealId === DEMO_FUND_III_ID ? DEMO_NOTICES : [];
}

function obligationsFor(dealId: string): Obligation[] {
  return dealId === DEMO_FUND_III_ID ? DEMO_OBLIGATIONS : [];
}

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
      pattern: /^\/api\/deals\/([^/]+)\/call-notices$/,
      handler: (m) => noticesFor(m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/deals\/([^/]+)\/side-letters\/obligations$/,
      handler: (m) => obligationsFor(m[1]),
    },
    {
      method: "GET",
      pattern: /^\/api\/portfolio\/positions$/,
      handler: () => demoPortfolioPositions(),
    },
    {
      method: "GET",
      pattern: /^\/api\/portfolio\/call-notices$/,
      handler: () => demoPortfolioNotices(),
    },
    {
      method: "GET",
      pattern: /^\/api\/portfolio\/compliance$/,
      handler: () => demoPortfolioCompliance(),
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
