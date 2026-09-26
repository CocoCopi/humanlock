import type { Signal } from "../types.js";

/**
 * Tracks whether the event stream itself is authentic.
 *
 * Two distinct attacks are covered:
 *  1. Page-injected events (`element.click()`, `dispatchEvent`) always have
 *     `isTrusted === false`. Cheap and decisive.
 *  2. Driver-synthesised events from CDP/WebDriver are trusted but frequently
 *     omit the pointer-motion delta fields a real input device supplies
 *     (`movementX`/`movementY`). This catches a lot of headless automation that
 *     the `isTrusted` check alone misses.
 */
export class AuthenticityTracker {
  private synthetic = 0;
  private total = 0;
  private moves = 0;
  private movesWithoutDelta = 0;
  private lastX = Number.NaN;
  private lastY = Number.NaN;

  reset(): void {
    this.synthetic = 0;
    this.total = 0;
    this.moves = 0;
    this.movesWithoutDelta = 0;
    this.lastX = Number.NaN;
    this.lastY = Number.NaN;
  }

  recordEvent(event: Event): void {
    this.total += 1;
    if (event.isTrusted === false) this.synthetic += 1;
  }

  recordMove(clientX: number, clientY: number, movementX: number | undefined, movementY: number | undefined): void {
    const moved = Number.isFinite(this.lastX)
      ? Math.abs(clientX - this.lastX) + Math.abs(clientY - this.lastY) > 2
      : false;
    this.lastX = clientX;
    this.lastY = clientY;

    this.moves += 1;
    if (moved && movementX === 0 && movementY === 0) this.movesWithoutDelta += 1;
  }

  get syntheticCount(): number {
    return this.synthetic;
  }

  analyze(): Signal[] {
    const out: Signal[] = [];

    if (this.synthetic > 0) {
      out.push({
        id: "input.synthetic_events",
        category: "input",
        severity: Math.min(1, 0.55 + this.synthetic * 0.05),
        automated: true,
        detail: `${this.synthetic} of ${this.total} events had isTrusted === false`,
      });
    }

    if (this.moves >= 20 && this.movesWithoutDelta / this.moves > 0.9) {
      out.push({
        id: "input.missing_pointer_delta",
        category: "input",
        severity: 0.5,
        automated: false,
        detail: "pointer moved while movementX/movementY stayed at zero",
      });
    }

    return out;
  }
}
