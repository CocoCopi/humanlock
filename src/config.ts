import type { SignalCategory } from "./types.js";

export type HoneypotMode =
  /** Decoys exist in the DOM but are never visible and never focusable. Safe. */
  | "invisible"
  /** Decoys are rendered as plausible, low-opacity controls near real ones. */
  | "visual";

export interface HoneypotConfig {
  enabled: boolean;
  /** Number of decoy traps to install. */
  count: number;
  /**
   * `invisible` is the default and is accessibility-safe: decoys are removed
   * from the accessibility tree and the tab order, so no human can reach them.
   * `visual` renders decoys that a human can see, which raises catch rate
   * against vision agents but also risks confusing real users.
   */
  mode: HoneypotMode;
  /** Include a classic off-screen form-field trap. */
  formFieldTrap: boolean;
}

export interface ObserveConfig {
  pointer: boolean;
  keyboard: boolean;
  visibility: boolean;
  clipboard: boolean;
  focus: boolean;
}

export interface ThresholdConfig {
  suspicious: number;
  automated: number;
}

export interface HumanLockConfig {
  /**
   * Shared secret used to HMAC-sign traces. Issue one per session from your
   * server. Without it, `report()` still works but produces an unsigned trace,
   * which a server must not trust.
   */
  sessionKey?: string;
  /**
   * When true, ANY signal with `automated: true` short-circuits the verdict to
   * `automated`. This is the maximum-aggression behavior.
   *
   * Defaults to false, and the default is deliberate: gating access on motor
   * precision alone reliably fails screen-reader users, keyboard-only users and
   * people with motor impairments. Making that the default would turn this
   * library into a discrimination engine. Enable it only if you have a human
   * review step behind it.
   */
  strictMode: boolean;
  debug: boolean;
  observe: ObserveConfig;
  thresholds: ThresholdConfig;
  /** Per-category multiplier applied to that category's aggregate score. */
  weights: Record<SignalCategory, number>;
  honeypots: HoneypotConfig;
  /** Minimum pointer samples before behavioral claims are reported. */
  minPointerSamples: number;
  /** Minimum keystrokes before typing claims are reported. */
  minKeySamples: number;
  /** Re-run environment checks on this interval (0 disables). */
  environmentIntervalMs: number;
  /** Attach listeners to `document` (default) or a specific element. */
  root?: Document | Element | null;
}

export type HumanLockUserConfig = Partial<
  Omit<HumanLockConfig, "observe" | "thresholds" | "weights" | "honeypots">
> & {
  observe?: Partial<ObserveConfig>;
  thresholds?: Partial<ThresholdConfig>;
  weights?: Partial<Record<SignalCategory, number>>;
  honeypots?: Partial<HoneypotConfig>;
};

export const DEFAULT_CONFIG: HumanLockConfig = {
  strictMode: false,
  debug: false,
  observe: {
    pointer: true,
    keyboard: true,
    visibility: true,
    clipboard: true,
    focus: true,
  },
  thresholds: {
    suspicious: 0.35,
    automated: 0.7,
  },
  weights: {
    environment: 1.0,
    integrity: 1.2,
    input: 1.1,
    honeypot: 1.6,
    behavior: 1.0,
  },
  honeypots: {
    enabled: true,
    count: 3,
    mode: "invisible",
    formFieldTrap: true,
  },
  minPointerSamples: 12,
  minKeySamples: 6,
  environmentIntervalMs: 0,
  root: null,
};

export function resolveConfig(user?: HumanLockUserConfig): HumanLockConfig {
  const c = user ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...c,
    observe: { ...DEFAULT_CONFIG.observe, ...(c.observe ?? {}) },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(c.thresholds ?? {}) },
    weights: { ...DEFAULT_CONFIG.weights, ...(c.weights ?? {}) },
    honeypots: { ...DEFAULT_CONFIG.honeypots, ...(c.honeypots ?? {}) },
  };
}
