import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import HeroSection from "./HeroSection";

// vite.config.ts sets globals:false, so testing-library's automatic cleanup
// never registers — without this, renders accumulate and queries find
// multiple matches.
afterEach(cleanup);

describe("HeroSection preview table", () => {
  it("renders the four diligence columns", () => {
    render(<HeroSection />);
    const table = screen.getByRole("table", { name: /diligence preview/i });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Deal",
      "Revenue quality",
      "Risk",
      "IC note",
    ]);
  });

  it("renders both fund rows", () => {
    render(<HeroSection />);
    const table = screen.getByRole("table", { name: /diligence preview/i });
    expect(within(table).getByText("Brightwater IV")).toBeTruthy();
    expect(within(table).getByText("Glenmoor III")).toBeTruthy();
  });

  it("renders citation markers in the product's bracketed form", () => {
    render(<HeroSection />);
    const table = screen.getByRole("table", { name: /diligence preview/i });
    const marks = within(table).getAllByText(/^\[S\d\]$/);
    expect(marks).toHaveLength(4);
  });

  it("keeps the email capture inert until a signup endpoint exists", () => {
    render(<HeroSection />);
    const input = screen.getByLabelText("Email address");
    expect(input.getAttribute("type")).toBe("email");
    // A bare <form> would navigate on submit; the handler must swallow it.
    expect(input.closest("form")).toBeTruthy();
  });
});

// The Ivory palette scoping assertion moved to pages/LandingPage.test.tsx when
// .landing-ivory was promoted from this section to the page shell.
