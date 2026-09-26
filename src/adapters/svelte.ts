import type { HumanLockUserConfig } from "../config.js";
import { createHumanLock, type HumanLock } from "../engine.js";
import type { Assessment } from "../types.js";

export interface HumanLockAction {
  update(config: HumanLockUserConfig): void;
  destroy(): void;
  /** Current assessment; call at submit time. */
  assess(): Assessment | null;
}

/**
 * Svelte action. Self-contained: no Svelte runtime is imported, so consumers
 * do not pay for a Svelte dependency they already have.
 *
 * ```svelte
 * <form use:humanlock={{ sessionKey: key }} on:submit={onSubmit}>...</form>
 * ```
 */
export function humanlock(
  node: Element,
  config: HumanLockUserConfig = {},
): HumanLockAction {
  let guard: HumanLock | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const boot = (next: HumanLockUserConfig) => {
    guard = createHumanLock({
      ...next,
      root: next.root ?? node.ownerDocument ?? null,
    });
    guard.start();
    timer = setInterval(() => guard?.assess(), 1000);
  };

  boot(config);

  return {
    update(next: HumanLockUserConfig) {
      if (timer) clearInterval(timer);
      guard?.destroy();
      boot(next);
    },
    destroy() {
      if (timer) clearInterval(timer);
      timer = null;
      guard?.destroy();
      guard = null;
    },
    assess() {
      return guard ? guard.assess() : null;
    },
  };
}
