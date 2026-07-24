import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DealAssistantPanel from "./DealAssistantPanel";
import type { ConversationEntry, Deal } from "@/lib/api";

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
