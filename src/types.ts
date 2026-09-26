/**
 * Public type surface for humanlock.
 *
 * A `Signal` is a single observation that carries evidence about whether the
 * current actor is a human or an automated agent. Signals are never combined
 * into a boolean "is bot" answer on the client — they are aggregated into a
 * risk score that should be re-evaluated server-side.
 */

/** The five independent evidence families. */
export type SignalCategory =
  | "environment"
  | "integrity"
  | "input"
  | "honeypot"
  | "behavior";

export const SIGNAL_CATEGORIES: readonly SignalCategory[] = [
  "environment",
  "integrity",
  "input",
  "honeypot",
  "behavior",
] as const;

/**
 * A single piece of evidence.
 *
 * `severity` is 0..1 and expresses how conclusive this observation is on its
 * own. `automated: true` means the observation can only plausibly be produced
 * by non-human control in normal use.
 */
export interface Signal {
  id: string;
  category: SignalCategory;
  severity: number;
  automated: boolean;
  detail?: string;
}

/** Coarse verdict derived from the aggregate risk score. */
export type Verdict = "human" | "suspicious" | "automated";

/** Raw sample counts, useful for confidence estimation and debugging. */
export interface SampleCounts {
  pointerMoves: number;
  clicks: number;
  keys: number;
}

/** Full result of an assessment at a point in time. */
export interface Assessment {
  verdict: Verdict;
  /** Aggregate risk, 0..1. Higher means more likely automated. */
  risk: number;
  /** How much evidence the score is based on, 0..1. */
  confidence: number;
  categoryScores: Record<SignalCategory, number>;
  signals: Signal[];
  samples: SampleCounts;
  durationMs: number;
  version: string;
}

/** The canonical, signable summary of a session. No raw input is included. */
export interface TracePayload {
  verdict: Verdict;
  risk: number;
  confidence: number;
  categories: Record<string, number>;
  signalIds: string[];
  samples: SampleCounts;
  durationMs: number;
  /** Location origin the trace was produced on. */
  origin: string;
  /** Client-generated nonce; the server should reject replays. */
  nonce: string;
  issuedAt: number;
}

/** An HMAC-signed trace that a server can verify without trusting the client. */
export interface SignedTrace {
  payload: TracePayload;
  /** base64url HMAC-SHA256 over the canonical serialization of `payload`. */
  signature: string;
  /** Signature algorithm identifier, versioned for future rotation. */
  alg: "HS256";
}

export type VerdictListener = (assessment: Assessment) => void;
