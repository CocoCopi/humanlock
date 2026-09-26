import { describe, expect, it } from "vitest";
import { BehaviorAnalyzer } from "../src/signals/behavior.js";

const T = { minPointerSamples: 12, minKeySamples: 6 };

describe("BehaviorAnalyzer — pointer", () => {
  it("flags a perfectly straight, constant-velocity, tremor-free path", () => {
    const a = new BehaviorAnalyzer();
    let t = 0;
    for (let i = 0; i < 40; i++) {
      a.recordPointer(100 + i * 4, 200 + i * 2, t);
      t += 16;
    }
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).toContain("behavior.pointer_dead_straight");
    expect(ids).toContain("behavior.pointer_constant_velocity");
    expect(ids).toContain("behavior.pointer_no_tremor");
  });

  it("does not flag a noisy, varying human-like path", () => {
    const a = new BehaviorAnalyzer();
    let t = 0;
    let x = 100;
    let y = 200;
    for (let i = 0; i < 60; i++) {
      const angle = Math.sin(i / 3) * 1.2 + (i % 2 === 0 ? 0.35 : -0.28);
      const step = 3 + ((i * 7) % 5);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      a.recordPointer(x, y, t);
      t += 12 + ((i * 13) % 9);
    }
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).not.toContain("behavior.pointer_dead_straight");
    expect(ids).not.toContain("behavior.pointer_no_tremor");
    expect(ids).not.toContain("behavior.pointer_teleport");
  });

  it("flags an impossible positional jump", () => {
    const a = new BehaviorAnalyzer();
    let t = 0;
    for (let i = 0; i < 20; i++) {
      a.recordPointer(100 + i * 3, 200 + Math.sin(i) * 5, t);
      t += 16;
    }
    a.recordPointer(900, 700, t + 8);
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).toContain("behavior.pointer_teleport");
  });

  it("stays silent below the minimum sample count", () => {
    const a = new BehaviorAnalyzer();
    for (let i = 0; i < 4; i++) a.recordPointer(i, i, i * 16);
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).toHaveLength(0);
  });

  it("flags clicks with no pointer approach", () => {
    const a = new BehaviorAnalyzer();
    for (let i = 0; i < 3; i++) a.recordClick(i * 3000);
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).toContain("behavior.click_without_approach");
  });
});

describe("BehaviorAnalyzer — keyboard", () => {
  it("flags metronomic and superhuman typing", () => {
    const a = new BehaviorAnalyzer();
    let t = 0;
    for (let i = 0; i < 10; i++) {
      a.recordKeyDown(`Key${i % 26}`, t);
      a.recordKeyUp(`Key${i % 26}`, t + 5);
      t += 10; // 10ms cadence: both metronomic and superhuman
    }
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).toContain("behavior.typing_metronomic");
    expect(ids).toContain("behavior.typing_superhuman");
  });

  it("ignores short bursts below the key threshold", () => {
    const a = new BehaviorAnalyzer();
    a.recordKeyDown("KeyA", 0);
    a.recordKeyUp("KeyA", 40);
    a.recordKeyDown("KeyB", 120);
    a.recordKeyUp("KeyB", 170);
    const ids = a.analyze(T).map((s) => s.id);
    expect(ids).toHaveLength(0);
  });
});

describe("BehaviorAnalyzer — bookkeeping", () => {
  it("tracks counts and resets cleanly", () => {
    const a = new BehaviorAnalyzer();
    a.recordPointer(1, 1, 0);
    a.recordClick(1);
    a.recordKeyDown("KeyA", 2);
    a.recordKeyUp("KeyA", 3);
    expect(a.counts()).toEqual({ pointerMoves: 1, clicks: 1, keys: 1 });
    a.reset();
    expect(a.counts()).toEqual({ pointerMoves: 0, clicks: 0, keys: 0 });
  });

  it("bounds memory by evicting old pointer samples", () => {
    const a = new BehaviorAnalyzer(20);
    for (let i = 0; i < 200; i++) a.recordPointer(i, i, i * 10);
    expect(a.counts().pointerMoves).toBe(20);
  });
});
