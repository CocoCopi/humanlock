import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignedTrace, TracePayload } from "../types.js";
import { canonicalize, fromBase64Url } from "./canonical.js";

export interface VerifyOptions {
  /** Reject traces older than this. Default: 10 minutes. */
  maxAgeMs?: number;
  /** Reject traces whose confidence is below this. Default: 0.35. */
  minConfidence?: number;
  /** Clock injection for tests. */
  now?: number;
}

export type VerifyReason =
  | "ok"
  | "malformed"
  | "unsupported_alg"
  | "bad_signature"
  | "expired"
  | "low_confidence";

export interface VerifyResult {
  valid: boolean;
  reason: VerifyReason;
  payload?: TracePayload;
}

/**
 * Verify a signed trace on the server.
 *
 * Enforcement should require `valid === true` AND a look at `payload.verdict`
 * and `payload.confidence`. Treat "low_confidence" as "ask for more evidence",
 * not as "cheat detected".
 */
export function verifyTrace(
  trace: SignedTrace,
  sessionKey: string,
  options: VerifyOptions = {},
): VerifyResult {
  const maxAgeMs = options.maxAgeMs ?? 10 * 60 * 1000;
  const minConfidence = options.minConfidence ?? 0.35;
  const now = options.now ?? Date.now();

  if (!trace || typeof trace !== "object" || !trace.payload || typeof trace.signature !== "string") {
    return { valid: false, reason: "malformed" };
  }
  if (trace.alg !== "HS256") {
    return { valid: false, reason: "unsupported_alg" };
  }
  if (!sessionKey) {
    return { valid: false, reason: "malformed" };
  }

  const expected = createHmac("sha256", sessionKey)
    .update(canonicalize(trace.payload))
    .digest();
  const provided = fromBase64Url(trace.signature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { valid: false, reason: "bad_signature" };
  }

  const age = now - trace.payload.issuedAt;
  if (!Number.isFinite(age) || age > maxAgeMs || age < -60_000) {
    return { valid: false, reason: "expired" };
  }

  if (trace.payload.confidence < minConfidence) {
    return { valid: false, reason: "low_confidence", payload: trace.payload };
  }

  return { valid: true, reason: "ok", payload: trace.payload };
}
