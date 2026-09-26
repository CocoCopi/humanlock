import type { HumanLockUserConfig } from "../config.js";
import { createHumanLock, type HumanLock } from "../engine.js";

/**
 * Framework-free mounting helper. Equivalent to `createHumanLock().start()`
 * but with the document wired in explicitly, for plain-script usage:
 *
 * ```html
 * <script type="module">
 *   import { mount } from "@cococopi/humanlock";
 *   const guard = mount({ sessionKey: window.__HL_KEY });
 *   document.addEventListener("submit", async (e) => {
 *     e.preventDefault();
 *     const trace = await guard.report();
 *     // POST `trace` to your server, which calls verifyTrace()
 *   });
 * </script>
 * ```
 */
export function mount(user?: HumanLockUserConfig): HumanLock {
  const guard = createHumanLock({
    root: typeof document !== "undefined" ? document : null,
    ...user,
  });
  guard.start();
  return guard;
}
