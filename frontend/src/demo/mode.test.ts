import { describe, it, expect, beforeEach } from "vitest";
import { isDemoMode, enableDemoMode, disableDemoMode, DEMO_FLAG_KEY } from "./mode";

describe("demo mode flag", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("is off by default", () => {
    expect(isDemoMode()).toBe(false);
  });

  it("turns on and persists in sessionStorage", () => {
    enableDemoMode();
    expect(isDemoMode()).toBe(true);
    expect(sessionStorage.getItem(DEMO_FLAG_KEY)).toBe("1");
  });

  it("turns off again", () => {
    enableDemoMode();
    disableDemoMode();
    expect(isDemoMode()).toBe(false);
    expect(sessionStorage.getItem(DEMO_FLAG_KEY)).toBeNull();
  });

  it("clears any real auth token when enabled so a live session cannot blend in", () => {
    localStorage.setItem("vyntic_auth_token", "real-jwt");
    enableDemoMode();
    expect(localStorage.getItem("vyntic_auth_token")).toBeNull();
  });
});
