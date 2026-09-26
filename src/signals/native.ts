/**
 * Native-source introspection.
 *
 * `[native code]` checks only mean something in a real browser. Embedded DOMs
 * (jsdom, happy-dom, linkedom) implement their APIs in JavaScript, so every
 * function there looks "overridden". Every consumer must consult
 * `isEmulatedDom()` first or it will emit a page of false positives.
 */

const NATIVE_SOURCE = /\{\s*\[native code\]\s*\}/;

/** True when the function's source looks like a real host-provided native. */
export function isNativeFunction(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  try {
    return NATIVE_SOURCE.test(Function.prototype.toString.call(fn));
  } catch {
    return false;
  }
}

/** True when we are running inside an emulated DOM, where introspection lies. */
export function isEmulatedDom(win: Window): boolean {
  const ua = win.navigator?.userAgent ?? "";
  if (/jsdom|happy-dom|linkedom/i.test(ua)) return true;
  // If even toString itself does not look native, trust nothing.
  return !isNativeFunction(Function.prototype.toString);
}
