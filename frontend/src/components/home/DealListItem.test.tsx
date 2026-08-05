import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Deal } from "@/lib/api";
import DealListItem from "./DealListItem";

/**
 * The deal-level delete is the demo's other destructive control (the per-
 * document one lives in DocumentsModal). It is hidden by withholding the
 * callback rather than by reading the demo flag here, so this component stays
 * unaware of the demo: HomePage passes `undefined` and every consumer between
 * them (HomeSidebar) threads it through.
 *
 * That indirection is what needs a test. `onDelete` was required until this
 * change, so nothing proves the optional path renders no button — and the
 * button only exists on hover, which is exactly where a regression hides.
 */
const deal: Deal = {
  deal_id: "brightwater_iv",
  name: "Brightwater Capital Partners IV",
  description: "Lower middle-market buyout",
  document_count: 6,
  stage: "Diligence",
  tags: ["Technology"],
  entity_type: "fund",
  manager_id: "brightwater",
  manager_name: "Brightwater Capital",
  vintage: 2026,
  strategy: "Buyout",
};

function renderItem(onDelete?: () => void) {
  const { container } = render(
    <MemoryRouter>
      <DealListItem deal={deal} onDelete={onDelete} onUpdateDeal={vi.fn()} uploading={false} />
    </MemoryRouter>
  );
  // The delete affordance only mounts while hovered.
  fireEvent.mouseEnter(container.firstElementChild as Element);
}

const DELETE_LABEL = `Delete ${deal.name}`;

afterEach(cleanup);

describe("DealListItem delete affordance", () => {
  it("offers delete on hover when a handler is supplied", () => {
    const onDelete = vi.fn();
    renderItem(onDelete);

    const button = screen.getByLabelText(DELETE_LABEL);
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders no delete affordance at all when the handler is withheld", () => {
    renderItem(undefined);

    expect(screen.queryByLabelText(DELETE_LABEL)).toBeNull();
    // The row is otherwise intact — only the destructive control is gone.
    expect(screen.getByText(deal.name)).toBeTruthy();
  });
});
