import type { Signal } from "../types.js";

/**
 * Detects tampering with the DOM APIs that an agent framework typically has to
 * hook in order to drive a page: event dispatch, coordinate mapping, and the
 * `isTrusted` guarantee itself.
 *
 * IMPORTANT: native-source introspection (`[native code]`) only works in a real
 * browser. Embedded or emulated DOMs (jsdom, happy-dom) implement their APIs in
 * JavaScript, so every function looks "overridden". We detect that case and
 * skip the introspection checks rather than emit a page full of false
 * positives.
 */

export { isEmulatedDom, isNativeFunction } from "./native.js";

import { isEmulatedDom, isNativeFunction } from "./native.js";

const AUTOMATION_GLOBALS = [
  "__playwright",
  "__puppeteer_utility_world__",
  "__puppeteer_evaluation_script__",
  "__nightmare",
  "_phantom",
  "callPhantom",
  "__selenium_unwrapped",
  "__webdriver_evaluate",
  "__driver_evaluate",
  "__fxdriver_evaluate",
  "__webdriver_script_fn",
  "webdriver",
  "domAutomation",
  "domAutomationController",
  "$chrome_asyncScriptInfo",
] as const;

const CDC_PATTERN = /^(\$?cdc_|\$chrome_asyncScriptInfo)/;

interface NativeTarget {
  id: string;
  detail: string;
  get: (win: Window) => unknown;
}

/**
 * lib.dom's `Window` type does not surface the DOM constructors as properties,
 * but every real window carries them. This cast gives typed access to the
 * prototypes we compare against.
 */
interface WindowConstructors {
  EventTarget?: typeof EventTarget;
  Element?: typeof Element;
  Document?: typeof Document;
  Event?: typeof Event;
  Navigator?: typeof Navigator;
}

function ctors(win: Window): WindowConstructors {
  return win as unknown as WindowConstructors;
}

const NATIVE_TARGETS: readonly NativeTarget[] = [
  {
    id: "integrity.dispatch_event_patched",
    detail: "EventTarget.prototype.dispatchEvent",
    get: (w) => ctors(w).EventTarget?.prototype.dispatchEvent,
  },
  {
    id: "integrity.add_event_listener_patched",
    detail: "EventTarget.prototype.addEventListener",
    get: (w) => ctors(w).EventTarget?.prototype.addEventListener,
  },
  {
    id: "integrity.get_bounding_client_rect_patched",
    detail: "Element.prototype.getBoundingClientRect",
    get: (w) => ctors(w).Element?.prototype.getBoundingClientRect,
  },
  {
    id: "integrity.query_selector_patched",
    detail: "Document.prototype.querySelector",
    get: (w) => ctors(w).Document?.prototype.querySelector,
  },
  {
    id: "integrity.event_is_trusted_patched",
    detail: "Event.prototype.isTrusted getter",
    get: (w) => {
      const proto = ctors(w).Event?.prototype;
      if (!proto) return undefined;
      return Object.getOwnPropertyDescriptor(proto, "isTrusted")?.get;
    },
  },
  {
    id: "integrity.document_has_focus_patched",
    detail: "Document.prototype.hasFocus",
    get: (w) => ctors(w).Document?.prototype.hasFocus,
  },
];

export function collectIntegritySignals(win: Window): Signal[] {
  const out: Signal[] = [];
  const emulate = isEmulatedDom(win);

  // Introspection checks: skipped on emulated DOMs, where they always misfire.
  if (!emulate) {
    for (const target of NATIVE_TARGETS) {
      let fn: unknown;
      try {
        fn = target.get(win);
      } catch {
        continue;
      }
      if (typeof fn === "function" && !isNativeFunction(fn)) {
        out.push({
          id: target.id,
          category: "integrity",
          severity: 0.8,
          automated: true,
          detail: `${target.detail} has been replaced with a non-native function`,
        });
      }
    }

    const webdriverDescriptor = Object.getOwnPropertyDescriptor(
      ctors(win).Navigator?.prototype ?? {},
      "webdriver",
    );
    if (webdriverDescriptor?.get && !isNativeFunction(webdriverDescriptor.get)) {
      out.push({
        id: "integrity.webdriver_getter_patched",
        category: "integrity",
        severity: 0.9,
        automated: true,
        detail: "navigator.webdriver getter has been replaced to hide automation",
      });
    }
  }

  // Automation marker globals. These are meaningful in both real and emulated
  // DOMs, so this runs unconditionally.
  for (const key of AUTOMATION_GLOBALS) {
    if (key in win && (win as unknown as Record<string, unknown>)[key] != null) {
      out.push({
        id: "integrity.automation_global",
        category: "integrity",
        severity: 0.75,
        automated: true,
        detail: `window.${key} is present`,
      });
    }
  }

  // ChromeDriver and friends leak recognisable per-instance DOM keys.
  try {
    const doc = win.document as unknown as Record<string, unknown> | undefined;
    if (doc) {
      for (const key of Object.keys(doc)) {
        if (CDC_PATTERN.test(key)) {
          out.push({
            id: "integrity.driver_dom_marker",
            category: "integrity",
            severity: 0.9,
            automated: true,
            detail: `driver marker "${key}" found on document`,
          });
        }
      }
    }
  } catch {
    /* ignore */
  }

  return out;
}
