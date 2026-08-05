import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DealAssistantPanel from "./DealAssistantPanel";
import type { ConversationEntry, Deal } from "@/lib/api";
import { DEMO_FLAG_KEY } from "@/demo/mode";
import { DEMO_FUND_III_ID, DEMO_FUND_IV_ID } from "@/demo/fixtures/entities";
import { DEMO_QUESTIONS } from "@/demo/fixtures/chat";

const deal: Deal = {
  deal_id: "hillpath_fund_iv",
  name: "Hillpath Fund IV",
  description: "",
  document_count: 0,
  stage: "Screening",
  tags: [],
  entity_type: "fund",
  manager_id: "hillpath",
  manager_name: "Hillpath Capital",
  vintage: 2026,
  strategy: "Buyout",
};

/** One of the generic fund cards — the set demo mode must never show. */
const GENERIC_CARD_TITLE = "Probe the DDQ & PPM";

const savedEntry: ConversationEntry = {
  id: "conversation-1",
  deal_id: deal.deal_id,
  question: "What contradictions exist around Daniel Roache?",
  answer: "The ADV says he departed, while the fund materials list him as active.",
  citations: [],
  workstream: "assistant",
  created_at: "2026-07-23T12:00:00Z",
};

const callbacks = {
  onCit: vi.fn(),
  onOpenDocument: vi.fn(),
};

describe("DealAssistantPanel history", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("rehydrates a saved exchange whenever a history-open action fires", () => {
    const { rerender } = render(
      <DealAssistantPanel
        deal={deal}
        documents={[]}
        selectedEntry={savedEntry}
        historyOpenSignal={1}
        newChatSignal={0}
        activeCitId={null}
        {...callbacks}
      />,
    );

    expect(screen.getByText(savedEntry.question)).toBeTruthy();
    expect(screen.getByText(savedEntry.answer)).toBeTruthy();

    rerender(
      <DealAssistantPanel
        deal={deal}
        documents={[]}
        selectedEntry={null}
        historyOpenSignal={1}
        newChatSignal={1}
        activeCitId={null}
        {...callbacks}
      />,
    );
    expect(screen.queryByText(savedEntry.question)).toBeNull();

    rerender(
      <DealAssistantPanel
        deal={deal}
        documents={[]}
        selectedEntry={savedEntry}
        historyOpenSignal={2}
        newChatSignal={1}
        activeCitId={null}
        {...callbacks}
      />,
    );
    expect(screen.getByText(savedEntry.question)).toBeTruthy();
    expect(screen.getByText(savedEntry.answer)).toBeTruthy();
  });

  it("does not erase the open thread when its history highlight clears", () => {
    const { rerender } = render(
      <DealAssistantPanel
        deal={deal}
        documents={[]}
        selectedEntry={savedEntry}
        historyOpenSignal={1}
        newChatSignal={0}
        activeCitId={null}
        {...callbacks}
      />,
    );

    rerender(
      <DealAssistantPanel
        deal={deal}
        documents={[]}
        selectedEntry={null}
        historyOpenSignal={1}
        newChatSignal={0}
        activeCitId={null}
        {...callbacks}
      />,
    );

    expect(screen.getByText(savedEntry.question)).toBeTruthy();
    expect(screen.getByText(savedEntry.answer)).toBeTruthy();
  });
});

describe("DealAssistantPanel empty state in demo mode", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    sessionStorage.setItem(DEMO_FLAG_KEY, "1");
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  function renderFor(dealId: string, name: string) {
    return render(
      <DealAssistantPanel
        deal={{ ...deal, deal_id: dealId, name }}
        documents={[]}
        selectedEntry={null}
        historyOpenSignal={0}
        newChatSignal={0}
        activeCitId={null}
        {...callbacks}
      />,
    );
  }

  it("shows nothing clickable until the demo's own question set has loaded", async () => {
    renderFor(DEMO_FUND_IV_ID, "Brightwater Capital Partners IV");

    // The fixtures arrive on a dynamic import, so this first paint is the
    // window in which the generic cards used to flash. A visitor who clicks one
    // gets the off-script fallback for a chip the demo itself just offered.
    expect(screen.queryByText(GENERIC_CARD_TITLE)).toBeNull();
    expect(screen.queryByText(/Try asking Vyntic/i)).toBeNull();

    expect(await screen.findByText(DEMO_QUESTIONS[0].question)).toBeTruthy();
    expect(screen.queryByText(GENERIC_CARD_TITLE)).toBeNull();
  });

  it("tells a visitor when a fund's questions are not part of the demo", async () => {
    renderFor(DEMO_FUND_III_ID, "Brightwater Capital Partners III");

    // The run was recorded against Fund IV only, so this workspace correctly
    // has no cards — but a bare composer with nothing to click reads as broken.
    expect(await screen.findByText(/no suggested questions for this fund/i)).toBeTruthy();
    expect(screen.queryByText(GENERIC_CARD_TITLE)).toBeNull();
  });
});
