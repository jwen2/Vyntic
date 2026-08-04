import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isDemoMode, enableDemoMode, disableDemoMode, DEMO_FLAG_KEY } from "./mode";

describe("demo mode flag", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("returns true when it successfully enables demo mode", () => {
    expect(enableDemoMode()).toBe(true);
  });

  it("leaves a real auth token untouched when sessionStorage.setItem throws", () => {
    localStorage.setItem("vyntic_auth_token", "real-jwt");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage) {
      if (this === sessionStorage) {
        throw new DOMException("QuotaExceededError");
      }
    });

    const result = enableDemoMode();

    expect(result).toBe(false);
    expect(localStorage.getItem("vyntic_auth_token")).toBe("real-jwt");
    expect(isDemoMode()).toBe(false);
  });

  it("does not throw when sessionStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage) {
      if (this === sessionStorage) {
        throw new DOMException("QuotaExceededError");
      }
    });

    expect(() => enableDemoMode()).not.toThrow();
  });

  it("does not throw when disableDemoMode's sessionStorage.removeItem fails", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function (this: Storage) {
      if (this === sessionStorage) {
        throw new DOMException("SecurityError");
      }
    });

    expect(() => disableDemoMode()).not.toThrow();
  });
});
