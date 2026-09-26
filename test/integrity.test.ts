import { afterEach, describe, expect, it } from "vitest";
import {
  collectIntegritySignals,
  isEmulatedDom,
  isNativeFunction,
} from "../src/signals/integrity.js";

describe("isNativeFunction", () => {
  it("rejects user-defined functions", () => {
    expect(isNativeFunction(() => 1)).toBe(false);
    expect(isNativeFunction(function named() {})).toBe(false);
  });

  it("rejects non-functions", () => {
    expect(isNativeFunction(undefined)).toBe(false);
    expect(isNativeFunction("nope")).toBe(false);
  });
});

describe("isEmulatedDom", () => {
  it("detects jsdom so native-source checks are skipped", () => {
    expect(isEmulatedDom(window)).toBe(true);
  });
});

describe("collectIntegritySignals", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__playwright;
    delete (window as unknown as Record<string, unknown>)._phantom;
    delete (document as unknown as Record<string, unknown>).$cdc_asdjflasutopfhvcZLmcfl_;
  });

  it("skips native-source introspection on an emulated DOM", () => {
    // jsdom implements its DOM in JavaScript, so every function there looks
    // non-native. Emitting tamper signals here would be a page of false
    // positives, so the check must be suppressed.
    expect(collectIntegritySignals(window)).toHaveLength(0);
  });

  it("detects automation marker globals", () => {
    (window as unknown as Record<string, unknown>).__playwright = {};
    const found = collectIntegritySignals(window);
    expect(found.map((s) => s.id)).toContain("integrity.automation_global");
  });

  it("detects driver DOM markers", () => {
    (document as unknown as Record<string, unknown>).$cdc_asdjflasutopfhvcZLmcfl_ = "abc";
    const found = collectIntegritySignals(window);
    expect(found.map((s) => s.id)).toContain("integrity.driver_dom_marker");
  });

  it("marks automation evidence as automated", () => {
    (window as unknown as Record<string, unknown>)._phantom = {};
    const signal = collectIntegritySignals(window).find(
      (s) => s.id === "integrity.automation_global",
    );
    expect(signal?.automated).toBe(true);
    expect(signal?.severity).toBeGreaterThan(0.5);
  });
});
