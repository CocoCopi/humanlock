import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { shouldChallenge } from "../src/engine.js";
import { aggregateRisk, categoryScores, confidence, verdictFor } from "../src/scoring.js";
import type { Assessment, Signal } from "../src/types.js";

const weights = DEFAULT_CONFIG.weights;

function riskOf(signals: Signal[]): number {
  return aggregateRisk(categoryScores(signals), weights, signals);
}

describe("scoring", () => {
  it("returns zero risk with no evidence", () => {
    const signals: Signal[] = [];
    expect(riskOf(signals)).toBe(0);
    expect(verdictFor(0, signals, DEFAULT_CONFIG)).toBe("human");
  });

  it("treats a decisive honeypot hit as automated", () => {
    const signals: Signal[] = [
      { id: "honeypot.interacted", category: "honeypot", severity: 1, automated: true },
    ];
    expect(riskOf(signals)).toBeCloseTo(1, 5);
    expect(verdictFor(riskOf(signals), signals, DEFAULT_CONFIG)).toBe("automated");
  });

  it("does not dilute a single decisive signal across quiet categories", () => {
    // Four categories are silent; the honeypot category alone must still
    // saturate the score.
    const signals: Signal[] = [
      { id: "honeypot.interacted", category: "honeypot", severity: 1, automated: true },
    ];
    expect(riskOf(signals)).toBeGreaterThan(0.7);
  });

  it("combines two medium signals into a stronger score", () => {
    const signals: Signal[] = [
      { id: "a", category: "environment", severity: 0.3, automated: false },
      { id: "b", category: "behavior", severity: 0.4, automated: false },
    ];
    const risk = riskOf(signals);
    expect(risk).toBeGreaterThan(0.3);
    expect(risk).toBeLessThan(0.7);
    expect(verdictFor(risk, signals, DEFAULT_CONFIG)).toBe("suspicious");
  });

  it("escalates to automated in strict mode on any automated signal", () => {
    const strict = { ...DEFAULT_CONFIG, strictMode: true };
    const signals: Signal[] = [
      { id: "weak", category: "environment", severity: 0.05, automated: true },
    ];
    const risk = riskOf(signals);
    expect(verdictFor(risk, signals, DEFAULT_CONFIG)).toBe("human");
    expect(verdictFor(risk, signals, strict)).toBe("automated");
  });
});

describe("confidence", () => {
  it("is low when there is no evidence", () => {
    expect(confidence({ pointerMoves: 0, clicks: 0, keys: 0 }, 0)).toBeCloseTo(0.1, 5);
  });

  it("grows with interaction volume and time", () => {
    const low = confidence({ pointerMoves: 2, clicks: 0, keys: 1 }, 500);
    const high = confidence({ pointerMoves: 200, clicks: 10, keys: 120 }, 60000);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(1);
  });
});

function assessment(overrides: Partial<Assessment>): Assessment {
  return {
    verdict: "human",
    risk: 0,
    confidence: 0.5,
    categoryScores: { environment: 0, integrity: 0, input: 0, honeypot: 0, behavior: 0 },
    signals: [],
    samples: { pointerMoves: 0, clicks: 0, keys: 0 },
    durationMs: 0,
    version: "test",
    ...overrides,
  };
}

describe("shouldChallenge", () => {
  it("refuses to act on low-confidence evidence", () => {
    expect(shouldChallenge(assessment({ verdict: "automated", confidence: 0.05 }))).toBe(false);
  });

  it("challenges plausible automation backed by enough evidence", () => {
    expect(shouldChallenge(assessment({ verdict: "suspicious", confidence: 0.9 }))).toBe(true);
    expect(shouldChallenge(assessment({ verdict: "automated", confidence: 0.9 }))).toBe(true);
  });

  it("leaves a confident human verdict alone", () => {
    expect(shouldChallenge(assessment({ verdict: "human", confidence: 0.9 }))).toBe(false);
  });
});
