import type { SampleCounts, Signal } from "../types.js";

export interface PointerSample {
  x: number;
  y: number;
  /** Milliseconds, monotonic. */
  t: number;
}

export interface BehaviorThresholds {
  minPointerSamples: number;
  minKeySamples: number;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) {
    const d = x - m;
    acc += d * d;
  }
  return Math.sqrt(acc / xs.length);
}

/** Coefficient of variation. 0 means perfectly constant. */
function cv(xs: number[]): number {
  const m = mean(xs);
  if (m === 0) return 0;
  return std(xs) / Math.abs(m);
}

function severityFor(value: number, threshold: number, ceiling: number): number {
  if (value <= threshold) return 0;
  if (value >= ceiling) return 1;
  return (value - threshold) / (ceiling - threshold);
}

/**
 * Collects raw pointer and keyboard timing and derives statistical claims about
 * whether the input stream came from a human motor system.
 *
 * This class deliberately has no DOM dependency, so the analysis can be tested
 * against synthetic and recorded traces.
 */
export class BehaviorAnalyzer {
  private readonly pointer: PointerSample[] = [];
  private readonly keyDowns = new Map<string, number>();
  private readonly dwell: number[] = [];
  private readonly flight: number[] = [];
  private lastKeyUpAt = -1;
  private keys = 0;
  private corrections = 0;
  private clicks = 0;
  private clickNoMove = 0;
  private lastPointer: PointerSample | null = null;

  constructor(private readonly maxPointerSamples = 600) {}

  reset(): void {
    this.pointer.length = 0;
    this.keyDowns.clear();
    this.dwell.length = 0;
    this.flight.length = 0;
    this.lastKeyUpAt = -1;
    this.keys = 0;
    this.corrections = 0;
    this.clicks = 0;
    this.clickNoMove = 0;
    this.lastPointer = null;
  }

  recordPointer(x: number, y: number, t: number): void {
    const sample: PointerSample = { x, y, t };
    this.pointer.push(sample);
    if (this.pointer.length > this.maxPointerSamples) this.pointer.shift();
    this.lastPointer = sample;
  }

  recordClick(t: number): void {
    this.clicks += 1;
    const last = this.lastPointer;
    if (!last || t - last.t > 600) {
      this.clickNoMove += 1;
    }
  }

  recordKeyDown(code: string, t: number): void {
    this.keyDowns.set(code, t);
    if (this.lastKeyUpAt >= 0) {
      const gap = t - this.lastKeyUpAt;
      if (gap >= 0 && gap < 5000) this.flight.push(gap);
    }
    this.keys += 1;
    if (code === "Backspace" || code === "Delete") this.corrections += 1;
  }

  recordKeyUp(code: string, t: number): void {
    const down = this.keyDowns.get(code);
    if (down !== undefined) {
      const d = t - down;
      if (d >= 0 && d < 5000) this.dwell.push(d);
      this.keyDowns.delete(code);
    }
    this.lastKeyUpAt = t;
  }

  counts(): SampleCounts {
    return {
      pointerMoves: this.pointer.length,
      clicks: this.clicks,
      keys: this.keys,
    };
  }

  /** Number of explicit user corrections (backspace/delete). Informational. */
  get correctionsCount(): number {
    return this.corrections;
  }

  analyze(thresholds: BehaviorThresholds): Signal[] {
    const signals: Signal[] = [];
    const pts = this.pointer;

    if (pts.length >= thresholds.minPointerSamples) {
      const segLen: number[] = [];
      const segDx: number[] = [];
      const segDy: number[] = [];
      const segDt: number[] = [];
      let teleports = 0;

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const dt = b.t - a.t;
        segLen.push(d);
        segDx.push(dx);
        segDy.push(dy);
        segDt.push(dt);
        if (d > 350 && dt <= 25) teleports += 1;
      }

      const pathLength = segLen.reduce((s, v) => s + v, 0);
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const displacement = Math.hypot(last.x - first.x, last.y - first.y);
      const straightness = pathLength > 1 ? displacement / pathLength : 1;

      // Second-difference magnitude relative to step size is a cheap proxy for
      // the aperiodic micro-tremor a human hand always produces.
      let d2Sum = 0;
      let d2Count = 0;
      for (let i = 2; i < segLen.length; i++) {
        d2Sum += Math.hypot(segDx[i]! - segDx[i - 1]!, segDy[i]! - segDy[i - 1]!);
        d2Count += 1;
      }
      const meanStep = mean(segLen);
      const residualRatio = meanStep > 0 && d2Count > 0 ? d2Sum / d2Count / meanStep : 1;

      const speeds = segLen.map((d, i) => {
        const dt = segDt[i]!;
        return dt > 0 ? d / dt : 0;
      });
      const speedCv = cv(speeds.filter((s) => s > 0));

      if (teleports > 0) {
        signals.push({
          id: "behavior.pointer_teleport",
          category: "behavior",
          severity: Math.min(1, 0.5 + teleports * 0.15),
          automated: true,
          detail: `${teleports} inter-sample jump(s) over 350px in under 25ms`,
        });
      }

      if (pts.length >= 20 && straightness > 0.995) {
        signals.push({
          id: "behavior.pointer_dead_straight",
          category: "behavior",
          severity: severityFor(straightness, 0.995, 1),
          automated: false,
          detail: `pointer path is ${(straightness * 100).toFixed(2)}% straight over ${pts.length} samples`,
        });
      }

      if (pts.length >= 25 && residualRatio < 0.02) {
        signals.push({
          id: "behavior.pointer_no_tremor",
          category: "behavior",
          severity: severityFor(0.02 - residualRatio, 0, 0.02),
          automated: false,
          detail: `micro-tremor residual ratio ${residualRatio.toFixed(4)} (human hands are noisier)`,
        });
      }

      if (speeds.length >= 8 && speedCv < 0.12) {
        signals.push({
          id: "behavior.pointer_constant_velocity",
          category: "behavior",
          severity: severityFor(0.12 - speedCv, 0, 0.12),
          automated: false,
          detail: `speed coefficient of variation ${speedCv.toFixed(3)} (near-constant)`,
        });
      }
    }

    if (this.clicks >= 3 && this.clickNoMove / this.clicks > 0.5) {
      signals.push({
        id: "behavior.click_without_approach",
        category: "behavior",
        severity: 0.6,
        automated: true,
        detail: `${this.clickNoMove}/${this.clicks} clicks had no preceding pointer movement`,
      });
    }

    if (this.keys >= thresholds.minKeySamples) {
      if (this.flight.length >= 8) {
        const c = cv(this.flight);
        if (c < 0.12) {
          signals.push({
            id: "behavior.typing_metronomic",
            category: "behavior",
            severity: severityFor(0.12 - c, 0, 0.12) * 0.8,
            automated: true,
            detail: `inter-key intervals show variation of ${c.toFixed(3)} (robotic regularity)`,
          });
        }
        const m = mean(this.flight);
        if (m < 25) {
          signals.push({
            id: "behavior.typing_superhuman",
            category: "behavior",
            severity: severityFor(25 - m, 0, 25) * 0.85,
            automated: true,
            detail: `mean inter-key interval ${m.toFixed(1)}ms is below human motor limits`,
          });
        }
      }

      // Informational, not flagged: humans make corrections, scripts never do.
      if (this.corrections === 0 && this.keys >= 30) {
        signals.push({
          id: "behavior.typing_no_corrections",
          category: "behavior",
          severity: 0.2,
          automated: false,
          detail: `${this.keys} keystrokes with zero backspace corrections`,
        });
      }
    }

    return signals;
  }
}
