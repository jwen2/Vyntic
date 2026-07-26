import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Button from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Button", () => {
  it("composes base, variant, and size class names", () => {
    render(
      <Button variant="primary" size="lg">
        Add deal
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Add deal" });
    expect(btn.className).toContain("btn");
    expect(btn.className).toContain("btn--primary");
    expect(btn.className).toContain("btn--lg");
  });

  it("defaults to md size", () => {
    render(<Button variant="secondary">History</Button>);
    expect(
      screen.getByRole("button", { name: "History" }).className
    ).toContain("btn--md");
  });

  it("supports the violet variant", () => {
    render(<Button variant="violet">Create</Button>);
    expect(
      screen.getByRole("button", { name: "Create" }).className
    ).toContain("btn--violet");
  });

  it("supports the xs size", () => {
    render(
      <Button variant="secondary" size="xs">
        Tag
      </Button>
    );
    expect(
      screen.getByRole("button", { name: "Tag" }).className
    ).toContain("btn--xs");
  });

  it("adds btn--icon when iconOnly and btn--full when fullWidth", () => {
    render(
      <Button variant="tint" iconOnly fullWidth title="New chat">
        <svg />
      </Button>
    );
    const btn = screen.getByRole("button", { name: "New chat" });
    expect(btn.className).toContain("btn--icon");
    expect(btn.className).toContain("btn--full");
  });

  it("when loading: disables, keeps the label, shows a spinner, hides icons", () => {
    render(
      <Button
        variant="primary"
        loading
        iconLeft={<svg data-testid="left" />}
        iconRight={<svg data-testid="right" />}
      >
        Running…
      </Button>
    );
    const btn = screen.getByRole("button", { name: /Running/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // label stays so the button width doesn't jump
    expect(screen.getByText("Running…")).toBeTruthy();
    // both provided icons are replaced by the spinner
    expect(screen.queryByTestId("left")).toBeNull();
    expect(screen.queryByTestId("right")).toBeNull();
    expect(btn.querySelector(".btn__spin")).toBeTruthy();
  });

  it("suppresses onClick when disabled", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" disabled onClick={onClick}>
        Ask
      </Button>
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("suppresses onClick when loading", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Ask
      </Button>
    );
    fireEvent.click(screen.getByRole("button", { name: /Ask/ }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when enabled", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" onClick={onClick}>
        Ask
      </Button>
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("warns in dev when an icon-only button has no accessible name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Button variant="subtle" iconOnly>
        <svg />
      </Button>
    );
    expect(warn).toHaveBeenCalled();
  });

  it("does not warn when icon-only has a title, and exposes the name", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Button variant="secondary" iconOnly title="Toggle theme">
        <svg />
      </Button>
    );
    expect(warn).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Toggle theme" })
    ).toBeTruthy();
  });

  it("forwards native button props", () => {
    render(
      <Button variant="primary" type="submit" data-testid="submit-btn">
        Go
      </Button>
    );
    const btn = screen.getByTestId("submit-btn") as HTMLButtonElement;
    expect(btn.type).toBe("submit");
  });
});
