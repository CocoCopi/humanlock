import type { HumanLockConfig } from "./config.js";
import type { SampleCounts, Signal, SignalCategory, Verdict } from "./types.js";
import { SIGNAL_CATEGORIES } from "./types.js";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Probabilistically combine the severities inside each category, so that two
 * independent medium-strength signals outweigh one.
 */
export function categoryScores(signals: Signal[]): Record<SignalCategory, number> {
  const out: Record<SignalCategory, number> = {
    environment: 0,
    integrity: 0,
    input: 0,
    honeypot: 0,
    behavior: 0,
  };
  const inverse: Record<SignalCategory, number> = {
    environment: 1,
    integrity: 1,
    input: 1,
    honeypot: 1,
    behavior: 1,
  };
  for (const signal of signals) {
    inverse[signal.category] *= 1 - clamp01(signal.severity);
  }
  for (const category of SIGNAL_CATEGORIES) {
    out[category] = clamp01(1 - inverse[category]);
  }
  return out;
}

/**
 * Weighted mean over the categories that actually produced evidence. We
 * deliberately exclude silent categories: otherwise a single decisive honeypot
 * hit would be diluted to a tenth of its weight by four quiet categories.
 */
export function aggregateRisk(
  scores: Record<SignalCategory, number>,
  weights: Record<SignalCategory, number>,
  signals: Signal[],
): number {
  const active = new Set(signals.map((s) => s.category));
  let weighted = 0;
  let total = 0;
  for (const category of active) {
    const w = weights[category];
    if (w <= 0) continue;
    weighted += scores[category] * w;
    total += w;
  }
  let risk = total > 0 ? weighted / total : 0;

  // Conclusive, high-severity automation evidence floors the score. Without
  // this, a single decisive observation could sit just under the automated
  // threshold purely because of category weighting math.
  let floor = 0;
  for (const signal of signals) {
    if (signal.automated && signal.severity >= 0.7) {
      floor = Math.max(floor, signal.severity * 0.8);
    }
  }
  risk = Math.max(risk, floor);

  return clamp01(risk);
}

/**
 * Confidence reflects how much evidence the score rests on. A verdict produced
 * from three pointer events deserves no trust; the same verdict after a minute
 * of interaction deserves some.
 *
 * Callers MUST gate enforcement on this: `confidence === 0` means "no
 * evidence", not "human".
 */
export function confidence(samples: SampleCounts, durationMs: number): number {
  const sampleScore =
    Math.min(1, samples.pointerMoves / 60) * 0.5 +
    Math.min(1, samples.keys / 40) * 0.3 +
    Math.min(1, samples.clicks / 5) * 0.2;
  const timeScore = Math.min(1, durationMs / 15000);
  return clamp01(0.1 + sampleScore * 0.55 + timeScore * 0.35);
}

export function verdictFor(
  risk: number,
  signals: Signal[],
  config: HumanLockConfig,
): Verdict {
  if (config.strictMode && signals.some((s) => s.automated)) return "automated";
  if (risk >= config.thresholds.automated) return "automated";
  if (risk >= config.thresholds.suspicious) return "suspicious";
  return "human";
}
