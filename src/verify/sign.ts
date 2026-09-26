import type { SignedTrace, TracePayload } from "../types.js";
import { canonicalize, toBase64Url } from "./canonical.js";

const encoder = new TextEncoder();

async function importKey(sessionKey: string): Promise<CryptoKey> {
  const cryptoObj: Crypto | undefined = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error("humanlock: Web Crypto (crypto.subtle) is unavailable in this environment");
  }
  return cryptoObj.subtle.importKey(
    "raw",
    encoder.encode(sessionKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Sign a trace so a server can prove the verdict was produced by an unmodified
 * client holding the session key.
 *
 * This does NOT prove the client is honest — a user can always extract the key
 * from their own browser. It proves the payload was not edited in transit or
 * replayed from a different session, which is the realistic threat model for
 * a shared per-session secret.
 */
export async function signTrace(payload: TracePayload, sessionKey: string): Promise<SignedTrace> {
  if (!sessionKey) throw new Error("humanlock: sessionKey must be a non-empty string");
  const cryptoObj = globalThis.crypto;
  const key = await importKey(sessionKey);
  const signature = await cryptoObj.subtle.sign("HMAC", key, encoder.encode(canonicalize(payload)));
  return {
    payload,
    signature: toBase64Url(new Uint8Array(signature)),
    alg: "HS256",
  };
}
