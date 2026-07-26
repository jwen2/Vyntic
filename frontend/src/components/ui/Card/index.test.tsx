import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import Card from "./index";

afterEach(() => {
  cleanup();
});

describe("Card", () => {
  it("composes base, level, and tone class names", () => {
    render(
      <Card level="panel" data-testid="c">
        body
      </Card>
    );
    const el = screen.getByTestId("c");
    expect(el.className).toContain("card");
    expect(el.className).toContain("card--panel");
    expect(el.className).toContain("card--surface");
  });

  it("defaults to the surface tone", () => {
    render(
      <Card level="inner" data-testid="c">
        body
      </Card>
    );
    expect(screen.getByTestId("c").className).toContain("card--surface");
  });

  it("supports every level", () => {
    render(
      <>
        <Card level="hero" data-testid="hero" />
        <Card level="panel" data-testid="panel" />
        <Card level="inner" data-testid="inner" />
      </>
    );
    expect(screen.getByTestId("hero").className).toContain("card--hero");
    expect(screen.getByTestId("panel").className).toContain("card--panel");
    expect(screen.getByTestId("inner").className).toContain("card--inner");
  });

  it("supports the alt and alert tones", () => {
    render(
      <>
        <Card level="inner" tone="alt" data-testid="alt" />
        <Card level="inner" tone="alert" data-testid="alert" />
      </>
    );
    expect(screen.getByTestId("alt").className).toContain("card--alt");
    expect(screen.getByTestId("alert").className).toContain("card--alert");
  });

  it("adds the dashed modifier only when asked", () => {
    render(
      <>
        <Card level="hero" dashed data-testid="dashed" />
        <Card level="hero" data-testid="solid" />
      </>
    );
    expect(screen.getByTestId("dashed").className).toContain("card--dashed");
    expect(screen.getByTestId("solid").className).not.toContain("card--dashed");
  });

  it("applies the padding escape hatch as an inline style", () => {
    render(
      <>
        <Card level="inner" padding={0} data-testid="zero" />
        <Card level="inner" padding="12px 14px" data-testid="custom" />
      </>
    );
    expect(screen.getByTestId("zero").style.padding).toBe("0px");
    expect(screen.getByTestId("custom").style.padding).toBe("12px 14px");
  });

  it("sets no inline padding when the prop is omitted", () => {
    render(<Card level="panel" data-testid="c" />);
    expect(screen.getByTestId("c").style.padding).toBe("");
  });

  it("lets a caller's style override the padding prop", () => {
    render(
      <Card level="inner" padding={0} style={{ padding: 4 }} data-testid="c" />
    );
    expect(screen.getByTestId("c").style.padding).toBe("4px");
  });

  it("appends the consumer className instead of replacing it", () => {
    render(
      <Card level="panel" className="overflow-hidden" data-testid="c" />
    );
    const el = screen.getByTestId("c");
    expect(el.className).toContain("card--panel");
    expect(el.className).toContain("overflow-hidden");
  });

  it("preserves other inline styles alongside the padding prop", () => {
    render(
      <Card level="panel" style={{ minHeight: 220 }} data-testid="c" />
    );
    expect(screen.getByTestId("c").style.minHeight).toBe("220px");
  });

  it("forwards the ref and passes unknown div props through", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Card level="inner" ref={ref} id="probe" title="a card" data-testid="c" />
    );
    expect(ref.current).toBe(screen.getByTestId("c"));
    expect(ref.current?.id).toBe("probe");
    expect(ref.current?.title).toBe("a card");
  });
});
