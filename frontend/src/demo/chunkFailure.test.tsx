/**
 * What both demo entry points do when the chat fixtures fail to load.
 *
 * `lib/sse.ts` and `DealAssistantPanel` each reach the fixtures through a
 * dynamic `import()`, which keeps them out of the production bundle but makes
 * them a network fetch that a stale deploy, an offline tab or a blocked chunk
 * can reject. Neither may fail silently: the chat would spin with no answer and
 * no error, and the empty state would quietly fall back to generic prompts the
 * demo has no answers for.
 *
 * The mock is hoisted and throws for every importer, so this file holds the
 * failure path alone; the working path is covered in `fixtures/chat.test.ts`,
 * `lib/sse.test.ts` and `DealAssistantPanel.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DealAssistantPanel from "@/components/assistant/DealAssistantPanel";
import type { Deal } from "@/lib/api";
import { sseStream } from "@/lib/sse";
import { DEMO_FLAG_KEY } from "./mode";
import { DEMO_FUND_IV_ID } from "./fixtures/entities";

vi.mock("@/demo/fixtures/chat", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const fund: Deal = {
  deal_id: DEMO_FUND_IV_ID,
  name: "Brightwater Capital Partners IV",
  description: "",
  document_count: 0,
  stage: "Diligence",
  tags: [],
  entity_type: "fund",
  manager_id: "brightwater_capital",
  manager_name: "Brightwater Capital Partners, LLC",
  vintage: 2026,
  strategy: "Buyout",
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.setItem(DEMO_FLAG_KEY, "1");
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("when the demo chat chunk fails to load", () => {
  it("reports the failure to the caller instead of hanging the stream", async () => {
    const onEvent = vi.fn();
    const errors: Error[] = [];
    const settled = new Promise<void>((resolve) => {
      sseStream(
        `/api/deals/${DEMO_FUND_IV_ID}/query/stream`,
        { question: "what is the fee offset" },
        {
          onEvent,
          onError: (err) => {
            errors.push(err);
            resolve();
          },
        },
      );
    });

    await settled;
    expect(errors).toHaveLength(1);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("says the suggestions are unavailable instead of offering generic ones", async () => {
    render(
      <DealAssistantPanel
        deal={fund}
        documents={[]}
        selectedEntry={null}
        historyOpenSignal={0}
        newChatSignal={0}
        activeCitId={null}
        onCit={vi.fn()}
        onOpenDocument={vi.fn()}
      />,
    );

    expect(await screen.findByText(/couldn't load the demo/i)).toBeTruthy();
    expect(screen.queryByText("Probe the DDQ & PPM")).toBeNull();
  });
});
