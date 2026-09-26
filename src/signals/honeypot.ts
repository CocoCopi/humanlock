import type { HoneypotConfig } from "../config.js";
import type { Signal } from "../types.js";

/**
 * Decoy ("honeypot") traps.
 *
 * The core idea: place elements into the DOM that are extremely attractive to
 * a selector-driven agent — familiar ids, `data-testid` values, accessible
 * roles — but which are structurally unreachable by a human.
 *
 * Scope, stated plainly: this catches agents that navigate by the DOM or the
 * accessibility tree (Playwright, Puppeteer, CDP scripts, most "browser agent"
 * frameworks). It does NOT catch a vision-driven agent that only looks at
 * pixels, because such an agent cannot see these nodes in the first place. A
 * decoy that a human could click is a decoy that can also confuse a human.
 */

const TEMPTING_IDS = [
  "submit",
  "continue",
  "next",
  "next-question",
  "start-exam",
  "begin-test",
  "login",
  "signin",
  "confirm",
] as const;

const TEMPTING_TESTIDS = [
  "submit-answer",
  "next-question",
  "start-exam",
  "primary-action",
  "continue-button",
] as const;

export interface HoneypotHandle {
  destroy(): void;
  signals(): Signal[];
}

function styleFor(doc: Document, visible: boolean): string {
  const shared =
    "position:fixed;z-index:-1;width:1px;height:1px;overflow:hidden;border:0;padding:0;margin:0;";
  if (visible) {
    // Aggressive mode: a plausibly-rendered control at a random viewport
    // position. A human CAN reach this, and may be confused by it.
    return `${shared}opacity:0.02;pointer-events:auto;left:8%;top:12%;`;
  }
  // Accessibility-safe default: invisible, unreachable by pointer or keyboard,
  // and removed from the accessibility tree.
  return `${shared}opacity:0;pointer-events:none;left:-9999px;top:-9999px;`;
}

export function installHoneypots(
  doc: Document,
  config: HoneypotConfig,
  onHoneypotHit?: () => void,
): HoneypotHandle {
  const found: Signal[] = [];
  const created: Element[] = [];
  const listeners: Array<() => void> = [];
  let observer: MutationObserver | null = null;
  let destroyed = false;

  const push = (signal: Signal) => {
    found.push(signal);
    onHoneypotHit?.();
  };

  const attach = (el: Element, label: string) => {
    const trap = (kind: string) => (event: Event) => {
      if (destroyed) return;
      push({
        id: "honeypot.interacted",
        category: "honeypot",
        severity: 1,
        automated: true,
        detail: `decoy "${label}" received a ${kind} event (trusted=${event.isTrusted})`,
      });
    };
    const onClick = trap("click");
    const onFocus = trap("focus");
    const onInput = trap("input");
    el.addEventListener("click", onClick, true);
    el.addEventListener("focus", onFocus, true);
    el.addEventListener("input", onInput, true);
    listeners.push(() => {
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("focus", onFocus, true);
      el.removeEventListener("input", onInput, true);
    });
  };

  const body = doc.body ?? doc.documentElement;

  const container = doc.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.setAttribute("data-humanlock", "decoys");
  container.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;";
  body.appendChild(container);
  created.push(container);

  const visible = config.mode === "visual";

  for (let i = 0; i < config.count; i++) {
    const el = doc.createElement("button");
    const id = TEMPTING_IDS[i % TEMPTING_IDS.length]!;
    const testid = TEMPTING_TESTIDS[i % TEMPTING_TESTIDS.length]!;
    el.setAttribute("type", "button");
    el.setAttribute("id", `${id}`);
    el.setAttribute("data-testid", testid);
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("tabindex", "-1");
    el.setAttribute("autocomplete", "off");
    el.textContent = "Continue";
    el.style.cssText = styleFor(doc, visible);
    const host = visible ? body : container;
    host.appendChild(el);
    created.push(el);
    attach(el, `#${id}`);
  }

  if (config.formFieldTrap) {
    const input = doc.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("name", "email");
    input.setAttribute("id", "email");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("tabindex", "-1");
    input.setAttribute("aria-hidden", "true");
    input.setAttribute("data-testid", "email-input");
    input.style.cssText = styleFor(doc, false);
    container.appendChild(input);
    created.push(input);

    const onInput = () => {
      if (destroyed || input.value.length === 0) return;
      push({
        id: "honeypot.form_field_filled",
        category: "honeypot",
        severity: 0.6,
        automated: true,
        detail: "offscreen form-field trap was filled programmatically",
      });
    };
    input.addEventListener("input", onInput, true);
    listeners.push(() => input.removeEventListener("input", onInput, true));
  }

  // If something removes our traps, that is itself interesting: agents and
  // DOM-scrubbing extensions both do it.
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver((records) => {
      if (destroyed) return;
      for (const record of records) {
        for (const node of Array.from(record.removedNodes)) {
          if (node instanceof Element && created.includes(node)) {
            push({
              id: "honeypot.removed",
              category: "honeypot",
              severity: 0.7,
              automated: false,
              detail: "a decoy node was removed from the DOM after installation",
            });
          }
        }
      }
    });
    observer.observe(body, { childList: true, subtree: true });
  }

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      observer = null;
      for (const off of listeners) off();
      listeners.length = 0;
      for (const el of created) el.remove();
      created.length = 0;
    },
    signals() {
      return [...found];
    },
  };
}
