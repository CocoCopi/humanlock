import type { TracePayload } from "../types.js";

/**
 * Deterministic JSON: object keys are emitted in sorted order so that the same
 * logical payload always produces the byte-identical string that gets signed.
 * Any deviation here would make signatures fail to verify across runtimes.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function canonicalize(payload: TracePayload): string {
  return stableStringify(payload);
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : "";
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = typeof atob === "function" ? atob(base64) : "";
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Cryptographically strong, URL-safe nonce for replay protection. */
export function randomNonce(): string {
  const cryptoObj: Crypto | undefined = globalThis.crypto;
  if (!cryptoObj?.getRandomValues) {
    throw new Error(
      "humanlock: a Web Crypto implementation is required to generate trace nonces",
    );
  }
  const bytes = new Uint8Array(16);
  cryptoObj.getRandomValues(bytes);
  return toBase64Url(bytes);
}
