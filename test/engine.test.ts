import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHumanLock, type HumanLock } from "../src/engine.js";
import { verifyTrace } from "../src/verify/server.js";

function dispatchMove(x: number, y: number): void {
  // The guard binds either pointermove or mousemove depending on what the
  // environment supports, so send both and let the irrelevant one be ignored.
  for (const type of ["pointermove", "mousemove"]) {
    document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));
  }
}

describe("createHumanLock", () => {
  let guard: HumanLock | null = null;

  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    document.body.innerHTML = "";
  });

  afterEach(() => {
    guard?.destroy();
    guard = null;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("produces a well-formed assessment", () => {
    guard = createHumanLock();
    guard.start();
    const a = guard.assess();
    expect(a.version).toBeTruthy();
    expect(a.risk).toBeGreaterThanOrEqual(0);
    expect(a.risk).toBeLessThanOrEqual(1);
    expect(["human", "suspicious", "automated"]).toContain(a.verdict);
    expect(a.samples.pointerMoves).toBe(0);
  });

  it("counts pointer samples as they arrive", () => {
    guard = createHumanLock();
    guard.start();
    for (let i = 0; i < 30; i++) dispatchMove(100 + i, 200 + i);
    expect(guard.assess().samples.pointerMoves).toBeGreaterThan(0);
  });

  it("flags script-dispatched events, which are never trusted", () => {
    guard = createHumanLock();
    guard.start();
    for (let i = 0; i < 5; i++) dispatchMove(10 + i, 10 + i);
    const a = guard.assess();
    expect(a.signals.map((s) => s.id)).toContain("input.synthetic_events");
    expect(a.verdict).not.toBe("human");
  });

  it("flags interaction with a decoy as automated", () => {
    guard = createHumanLock();
    guard.start();
    const decoy = document.getElementById("submit");
    expect(decoy).toBeTruthy();
    decoy!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const a = guard.assess();
    expect(a.signals.map((s) => s.id)).toContain("honeypot.interacted");
    expect(a.verdict).toBe("automated");
  });

  it("returns null from report() when no session key is configured", async () => {
    guard = createHumanLock();
    guard.start();
    await expect(guard.report()).resolves.toBeNull();
  });

  it("emits signed traces that verify on the server", async () => {
    guard = createHumanLock({ sessionKey: "session-secret" });
    guard.start();
    for (let i = 0; i < 10; i++) dispatchMove(50 + i, 60 + i);
    document.getElementById("submit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const trace = await guard.report();
    expect(trace).not.toBeNull();
    const result = verifyTrace(trace!, "session-secret", { minConfidence: 0 });
    expect(result.valid).toBe(true);
    expect(result.payload?.verdict).toBe("automated");
    expect(result.payload?.origin).toBeTruthy();
  });

  it("rejects a trace whose payload was edited after signing", async () => {
    guard = createHumanLock({ sessionKey: "session-secret" });
    guard.start();
    const trace = await guard.report();
    trace!.payload.verdict = "human";
    trace!.payload.risk = 0;
    expect(verifyTrace(trace!, "session-secret", { minConfidence: 0 }).reason).toBe("bad_signature");
  });

  it("notifies listeners on honeypot hits", () => {
    guard = createHumanLock();
    guard.start();
    const seen: string[] = [];
    guard.onVerdict((a) => seen.push(a.verdict));
    document.getElementById("submit")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(seen.length).toBeGreaterThan(0);
  });

  it("tears down decoys and listeners on destroy", () => {
    guard = createHumanLock();
    guard.start();
    guard.destroy();
    guard = null;
    expect(document.querySelector('[data-humanlock="decoys"]')).toBeNull();
  });

  it("reports a no-DOM assessment outside a browser", () => {
    const headless = createHumanLock({ root: null });
    const a = headless.assess();
    expect(a.signals.map((s) => s.id)).toContain("engine.no_dom");
    expect(a.confidence).toBe(0);
  });
});
