import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Input, { Select, Textarea } from "./index";

afterEach(cleanup);

describe("Input", () => {
  it("composes shell, size, and full-width classes", () => {
    render(<Input aria-label="Search" fieldSize="sm" fullWidth />);
    const input = screen.getByRole("textbox", { name: "Search" });
    const shell = input.parentElement;
    expect(shell?.className).toContain("input-shell");
    expect(shell?.className).toContain("input-shell--sm");
    expect(shell?.className).toContain("input-shell--full");
  });

  it("renders adornments without hiding native input props", () => {
    render(
      <Input
        aria-label="Filter"
        placeholder="Filter grid"
        iconLeft={<svg data-testid="search-icon" />}
        actionRight={<button type="button">Clear</button>}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Filter" }).getAttribute("placeholder")).toBe(
      "Filter grid",
    );
    expect(screen.getByTestId("search-icon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
  });

  it("sets aria-invalid when invalid", () => {
    render(<Input aria-label="Name" invalid />);
    expect(screen.getByRole("textbox", { name: "Name" }).getAttribute("aria-invalid")).toBe(
      "true",
    );
  });
});

describe("Textarea", () => {
  it("uses the shared field classes", () => {
    render(<Textarea aria-label="Prompt" fieldSize="lg" fullWidth />);
    const textarea = screen.getByRole("textbox", { name: "Prompt" });
    expect(textarea.className).toContain("textarea-control");
    expect(textarea.className).toContain("textarea-control--lg");
    expect(textarea.className).toContain("textarea-control--full");
  });
});

describe("Select", () => {
  it("uses the shared field classes and forwards options", () => {
    render(
      <Select aria-label="Format" fieldSize="sm">
        <option value="text">Text</option>
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "Format" });
    expect(select.className).toContain("select-control");
    expect(select.className).toContain("select-control--sm");
    expect(screen.getByRole("option", { name: "Text" })).toBeTruthy();
  });
});
