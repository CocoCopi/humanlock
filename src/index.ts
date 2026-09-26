/**
 * humanlock — client-side automated-agent detection.
 *
 * Read the "Limits" section of the README before enforcing on any of these
 * signals. The short version: this raises the cost of automation and catches
 * the naive majority. It is a layer, not a wall, and the client verdict is
 * only worth trusting when it is signed and re-scored on your server.
 */

export {
  DEFAULT_CONFIG,
  resolveConfig,
  type HoneypotConfig,
  type HoneypotMode,
  type HumanLockConfig,
  type HumanLockUserConfig,
  type ObserveConfig,
  type ThresholdConfig,
} from "./config.js";

export { createHumanLock, shouldChallenge, type HumanLock } from "./engine.js";

export { aggregateRisk, categoryScores, confidence, verdictFor } from "./scoring.js";

export { BehaviorAnalyzer, type BehaviorThresholds, type PointerSample } from "./signals/behavior.js";
export { AuthenticityTracker } from "./signals/events.js";
export { collectEnvironmentSignals } from "./signals/environment.js";
export {
  collectIntegritySignals,
  isEmulatedDom,
  isNativeFunction,
} from "./signals/integrity.js";
export { installHoneypots, type HoneypotHandle } from "./signals/honeypot.js";

export { canonicalize, randomNonce, stableStringify } from "./verify/canonical.js";
export { signTrace } from "./verify/sign.js";

export { mount } from "./adapters/vanilla.js";

export {
  SIGNAL_CATEGORIES,
  type Assessment,
  type SampleCounts,
  type Signal,
  type SignalCategory,
  type SignedTrace,
  type TracePayload,
  type Verdict,
  type VerdictListener,
} from "./types.js";

export { VERSION } from "./version.js";
