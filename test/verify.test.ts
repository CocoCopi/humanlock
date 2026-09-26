// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalize, stableStringify } from "../src/verify/canonical.js";
import { verifyTrace } from "../src/verify/server.js";
import { signTrace } from "../src/verify/sign.js";
import type { TracePayload } from "../src/types.js";

const KEY = "integration-test-secret";

function makePayload(overrides: Partial<TracePayload> = {}): TracePayload {
  return {
    verdict: "human",
    risk: 0.1,
    confidence: 0.8,
    categories: { behavior: 0.1, environment: 0 },
    signalIds: ["behavior.pointer_no_tremor"],
    samples: { pointerMoves: 50, clicks: 3, keys: 40 },
    durationMs: 12000,
    origin: "https://exam.example",
    nonce: "nonce-0001",
    issuedAt: Date.now(),
    ...overrides,
  };
}

describe("canonicalization", () => {
  it("is independent of key insertion order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  it("preserves nested structure deterministically", () => {
    const issuedAt = 1_700_000_000_000;
    expect(canonicalize(makePayload({ issuedAt }))).toBe(
      canonicalize(makePayload({ issuedAt })),
    );
  });

  it("drops undefined members so absent and undefined keys agree", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
  });
});

describe("verifyTrace", () => {
  it("accepts a freshly signed trace", async () => {
    const trace = await signTrace(makePayload(), KEY);
    const result = verifyTrace(trace, KEY);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.payload?.nonce).toBe("nonce-0001");
  });

  it("rejects a tampered payload", async () => {
    const trace = await signTrace(makePayload(), KEY);
    trace.payload.risk = 0.99;
    expect(verifyTrace(trace, KEY).reason).toBe("bad_signature");
  });

  it("rejects a signature made with a different key", async () => {
    const trace = await signTrace(makePayload(), "other-key");
    expect(verifyTrace(trace, KEY).reason).toBe("bad_signature");
  });

  it("rejects an unsupported algorithm", async () => {
    const trace = await signTrace(makePayload(), KEY);
    (trace as unknown as { alg: string }).alg = "HS512";
    expect(verifyTrace(trace, KEY).reason).toBe("unsupported_alg");
  });

  it("rejects a malformed trace", () => {
    expect(verifyTrace({} as never, KEY).reason).toBe("malformed");
  });

  it("rejects a stale trace", async () => {
    const trace = await signTrace(makePayload({ issuedAt: Date.now() - 60_000 }), KEY);
    expect(verifyTrace(trace, KEY, { maxAgeMs: 1000 }).reason).toBe("expired");
  });

  it("rejects a trace with too little evidence behind it", async () => {
    const trace = await signTrace(makePayload({ confidence: 0.05 }), KEY);
    const result = verifyTrace(trace, KEY, { minConfidence: 0.5 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("low_confidence");
    // The payload is still handed back so the caller can request more evidence.
    expect(result.payload?.confidence).toBe(0.05);
  });

  it("rejects a truncated signature without throwing", async () => {
    const trace = await signTrace(makePayload(), KEY);
    trace.signature = trace.signature.slice(0, 10);
    expect(verifyTrace(trace, KEY).reason).toBe("bad_signature");
  });
});
