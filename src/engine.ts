import { resolveConfig, type HumanLockConfig, type HumanLockUserConfig } from "./config.js";
import { aggregateRisk, categoryScores, confidence, verdictFor } from "./scoring.js";
import { BehaviorAnalyzer } from "./signals/behavior.js";
import { collectEnvironmentSignals } from "./signals/environment.js";
import { AuthenticityTracker } from "./signals/events.js";
import { installHoneypots, type HoneypotHandle } from "./signals/honeypot.js";
import { collectIntegritySignals } from "./signals/integrity.js";
import {
  SIGNAL_CATEGORIES,
  type Assessment,
  type SampleCounts,
  type Signal,
  type SignalCategory,
  type SignedTrace,
  type TracePayload,
  type VerdictListener,
} from "./types.js";
import { randomNonce } from "./verify/canonical.js";
import { signTrace } from "./verify/sign.js";
import { VERSION } from "./version.js";

export interface HumanLock {
  readonly config: HumanLockConfig;
  readonly started: boolean;
  start(): void;
  stop(): void;
  destroy(): void;
  assess(): Assessment;
  report(): Promise<SignedTrace | null>;
  onVerdict(listener: VerdictListener): () => void;
}

function emptyCategoryScores(): Record<SignalCategory, number> {
  return { environment: 0, integrity: 0, input: 0, honeypot: 0, behavior: 0 };
}

function emptyCounts(): SampleCounts {
  return { pointerMoves: 0, clicks: 0, keys: 0 };
}

class Guard implements HumanLock {
  readonly config: HumanLockConfig;
  started = false;

  private win: Window | null = null;
  private root: Document | Element | null = null;
  private readonly behavior = new BehaviorAnalyzer();
  private readonly authenticity = new AuthenticityTracker();
  private environmentSignals: Signal[] = [];
  private integritySignals: Signal[] = [];
  private honeypot: HoneypotHandle | null = null;
  private detach: Array<() => void> = [];
  private readonly listeners = new Set<VerdictListener>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private startTime = 0;

  constructor(user?: HumanLockUserConfig) {
    this.config = resolveConfig(user);
  }

  private now(): number {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  }

  start(): void {
    if (this.started) return;

    this.root =
      this.config.root ?? (typeof document !== "undefined" ? document : null);
    this.win =
      this.root?.ownerDocument?.defaultView ??
      (typeof window !== "undefined" ? (window as Window) : null);

    this.startTime = this.now();
    this.started = true;

    if (!this.win || !this.root) return;

    this.refreshStatic();
    if (this.config.environmentIntervalMs > 0) {
      this.interval = setInterval(() => this.refreshStatic(), this.config.environmentIntervalMs);
    }

    if (this.config.honeypots.enabled) {
      const doc = this.root.ownerDocument ?? (this.root as Document);
      this.honeypot = installHoneypots(doc, this.config.honeypots, () => {
        this.emit();
      });
    }

    this.attachListeners();
  }

  private refreshStatic(): void {
    if (!this.win) return;
    try {
      this.environmentSignals = collectEnvironmentSignals(this.win);
    } catch {
      this.environmentSignals = [];
    }
    try {
      this.integritySignals = collectIntegritySignals(this.win);
    } catch {
      this.integritySignals = [];
    }
  }

  private attachListeners(): void {
    const target = this.root;
    const win = this.win;
    if (!target || !win) return;

    const on = (type: string, handler: (event: Event) => void) => {
      target.addEventListener(type, handler, true);
      this.detach.push(() => target.removeEventListener(type, handler, true));
    };

    const hasPointer = typeof (win as unknown as { PointerEvent?: unknown }).PointerEvent === "function";
    const moveType = hasPointer ? "pointermove" : "mousemove";

    if (this.config.observe.pointer) {
      on(moveType, (event) => {
        const e = event as MouseEvent;
        this.authenticity.recordEvent(e);
        this.authenticity.recordMove(e.clientX, e.clientY, e.movementX, e.movementY);
        this.behavior.recordPointer(e.clientX, e.clientY, this.now());
      });
      on("click", (event) => {
        this.authenticity.recordEvent(event);
        this.behavior.recordClick(this.now());
      });
    }

    if (this.config.observe.keyboard) {
      on("keydown", (event) => {
        const e = event as KeyboardEvent;
        this.authenticity.recordEvent(e);
        this.behavior.recordKeyDown(e.code || e.key, this.now());
      });
      on("keyup", (event) => {
        const e = event as KeyboardEvent;
        this.authenticity.recordEvent(e);
        this.behavior.recordKeyUp(e.code || e.key, this.now());
      });
    }

    if (this.config.observe.clipboard) {
      on("paste", (event) => this.authenticity.recordEvent(event));
    }
    if (this.config.observe.focus) {
      on("focusin", (event) => this.authenticity.recordEvent(event));
    }
    if (this.config.observe.visibility) {
      on("visibilitychange", (event) => this.authenticity.recordEvent(event));
    }
  }

  private collectSignals(): Signal[] {
    return [
      ...this.environmentSignals,
      ...this.integritySignals,
      ...this.authenticity.analyze(),
      ...this.behavior.analyze({
        minPointerSamples: this.config.minPointerSamples,
        minKeySamples: this.config.minKeySamples,
      }),
      ...(this.honeypot?.signals() ?? []),
    ];
  }

  assess(): Assessment {
    if (!this.win) {
      const signals: Signal[] = [
        {
          id: "engine.no_dom",
          category: "environment",
          severity: 0,
          automated: false,
          detail: "no DOM available; the guard only runs in a browser",
        },
      ];
      return {
        verdict: "suspicious",
        risk: 0,
        confidence: 0,
        categoryScores: emptyCategoryScores(),
        signals,
        samples: emptyCounts(),
        durationMs: 0,
        version: VERSION,
      };
    }

    const signals = this.collectSignals();
    const scores = categoryScores(signals);
    const risk = aggregateRisk(scores, this.config.weights, signals);
    const samples = this.behavior.counts();
    const durationMs = Math.max(0, this.now() - this.startTime);
    const assessment: Assessment = {
      verdict: verdictFor(risk, signals, this.config),
      risk,
      confidence: confidence(samples, durationMs),
      categoryScores: scores,
      signals,
      samples,
      durationMs,
      version: VERSION,
    };

    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.debug("[humanlock]", assessment.verdict, assessment.risk.toFixed(3), signals);
    }
    return assessment;
  }

  async report(): Promise<SignedTrace | null> {
    if (!this.config.sessionKey) return null;
    const assessment = this.assess();

    const categories: Record<string, number> = {};
    for (const category of SIGNAL_CATEGORIES) categories[category] = assessment.categoryScores[category];

    let origin = "";
    try {
      origin = this.win?.location?.origin ?? "";
    } catch {
      origin = "";
    }

    const payload: TracePayload = {
      verdict: assessment.verdict,
      risk: assessment.risk,
      confidence: assessment.confidence,
      categories,
      signalIds: assessment.signals.map((s) => s.id).sort(),
      samples: assessment.samples,
      durationMs: Math.round(assessment.durationMs),
      origin,
      nonce: randomNonce(),
      issuedAt: Date.now(),
    };

    return signTrace(payload, this.config.sessionKey);
  }

  onVerdict(listener: VerdictListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const assessment = this.assess();
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(assessment);
      } catch {
        /* a misbehaving listener must not break capture */
      }
    }
  }

  stop(): void {
    for (const off of this.detach) off();
    this.detach = [];
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.honeypot?.destroy();
    this.honeypot = null;
    this.started = false;
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
    this.behavior.reset();
    this.authenticity.reset();
    this.environmentSignals = [];
    this.integritySignals = [];
  }
}

export function createHumanLock(user?: HumanLockUserConfig): HumanLock {
  return new Guard(user);
}

/**
 * Convenience gate for integrators. Returns true when the evidence is both
 * strong enough to matter AND backed by enough samples to be trustworthy.
 *
 * Note the two-sided check: a `suspicious` verdict with a confidence of 0.05
 * (three pointer events) is noise, not a signal.
 */
export function shouldChallenge(assessment: Assessment, minConfidence = 0.35): boolean {
  return (
    assessment.confidence >= minConfidence &&
    (assessment.verdict === "suspicious" || assessment.verdict === "automated")
  );
}
