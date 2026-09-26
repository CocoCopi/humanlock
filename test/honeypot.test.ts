import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installHoneypots } from "../src/signals/honeypot.js";
import type { HoneypotHandle } from "../src/signals/honeypot.js";

const config = { enabled: true, count: 3, mode: "invisible" as const, formFieldTrap: true };

describe("installHoneypots", () => {
  let handle: HoneypotHandle | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    handle?.destroy();
    handle = null;
    document.body.innerHTML = "";
  });

  it("installs decoys with tempting, agent-facing selectors", () => {
    handle = installHoneypots(document, config);
    const submit = document.getElementById("submit");
    expect(submit).toBeTruthy();
    expect(submit?.getAttribute("data-testid")).toBe("submit-answer");
  });

  it("keeps decoys out of the accessibility tree and tab order", () => {
    handle = installHoneypots(document, config);
    const submit = document.getElementById("submit")!;
    expect(submit.getAttribute("aria-hidden")).toBe("true");
    expect(submit.getAttribute("tabindex")).toBe("-1");
  });

  it("records a hit when a decoy is activated", () => {
    handle = installHoneypots(document, config);
    document.getElementById("submit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const found = handle.signals().map((s) => s.id);
    expect(found).toContain("honeypot.interacted");
  });

  it("records a hit when the offscreen form trap is filled", () => {
    handle = installHoneypots(document, config);
    const input = document.querySelector('input[name="email"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "agent@example.com";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(handle.signals().map((s) => s.id)).toContain("honeypot.form_field_filled");
  });

  it("does not report a hit while the trap stays empty", () => {
    handle = installHoneypots(document, config);
    const input = document.querySelector('input[name="email"]') as HTMLInputElement;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(handle.signals()).toHaveLength(0);
  });

  it("cleans up completely on destroy", () => {
    handle = installHoneypots(document, config);
    handle.destroy();
    expect(document.querySelector('[data-humanlock="decoys"]')).toBeNull();
    expect(document.getElementById("submit")).toBeNull();
    handle = null;
  });

  it("can be disabled by configuration", () => {
    handle = installHoneypots(document, { ...config, count: 0, formFieldTrap: false });
    expect(document.getElementById("submit")).toBeNull();
  });
});
