import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Modal from "./Modal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Modal", () => {
  it("renders a labelled dialog into a body portal", () => {
    render(
      <Modal onClose={() => {}} title="Documents">
        <p>body</p>
      </Modal>
    );
    const dialog = screen.getByRole("dialog", { name: "Documents" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // portaled to <body>, not nested in the caller's tree
    expect(dialog.closest(".modal-overlay")?.parentElement).toBe(document.body);
  });

  it("composes size class names and defaults to md", () => {
    const { rerender } = render(
      <Modal onClose={() => {}} title="A" size="lg">
        <p>body</p>
      </Modal>
    );
    expect(screen.getByRole("dialog").className).toContain("modal-panel--lg");

    rerender(
      <Modal onClose={() => {}} title="A">
        <p>body</p>
      </Modal>
    );
    expect(screen.getByRole("dialog").className).toContain("modal-panel--md");
  });

  it("falls back to ariaLabel when there is no title", () => {
    render(
      <Modal onClose={() => {}} ariaLabel="Select documents">
        <p>body</p>
      </Modal>
    );
    expect(screen.getByRole("dialog", { name: "Select documents" })).toBeTruthy();
  });

  it("renders eyebrow, description, and header actions", () => {
    render(
      <Modal
        onClose={() => {}}
        eyebrow="LP position"
        title="Hillpath Fund IV"
        description="Track commitment and current fund values."
        headerActions={<button type="button">Upload</button>}
      >
        <p>body</p>
      </Modal>
    );
    expect(screen.getByText("LP position")).toBeTruthy();
    expect(
      screen.getByText("Track commitment and current fund values.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
  });

  it("closes on the close button and on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="Documents">
        <p>body</p>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("omits the close button when showClose is false", () => {
    render(
      <Modal onClose={() => {}} title="Confirm action" showClose={false}>
        <p>body</p>
      </Modal>
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("renders no header when given no header content", () => {
    const { container } = render(
      <Modal onClose={() => {}} ariaLabel="Bare">
        <p>body</p>
      </Modal>
    );
    expect(container.ownerDocument.querySelector(".modal-header")).toBeNull();
  });

  it("closes on scrim click but not on panel click", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="Documents">
        <p>body</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores scrim clicks when closeOnOverlayClick is false", () => {
    const onClose = vi.fn();
    render(
      <Modal onClose={onClose} title="New deal" closeOnOverlayClick={false}>
        <p>body</p>
      </Modal>
    );
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  // jsdom does no layout, so useDialogA11y's `offsetParent !== null` visibility
  // filter matches nothing and the hook falls back to focusing the panel. Assert
  // the contract that holds in both jsdom and a real browser: focus lands inside
  // the dialog rather than staying on <body>.
  it("moves focus into the dialog on mount and restores it on unmount", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Modal onClose={() => {}} title="Documents" showClose={false}>
        <button type="button">First</button>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog === document.activeElement || dialog.contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
