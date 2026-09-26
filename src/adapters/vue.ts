import { onMounted, onUnmounted, ref, type Ref } from "vue";
import type { HumanLockUserConfig } from "../config.js";
import { createHumanLock, type HumanLock } from "../engine.js";
import type { Assessment, SignedTrace } from "../types.js";

export interface UseHumanLockReturn {
  assessment: Ref<Assessment | null>;
  refresh: () => void;
  report: () => Promise<SignedTrace | null>;
  getGuard: () => HumanLock | null;
}

/** Vue 3 composable. Must be called from `setup()`. */
export function useHumanLock(config?: HumanLockUserConfig): UseHumanLockReturn {
  const assessment = ref<Assessment | null>(null);
  let guard: HumanLock | null = null;
  let off: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    guard = createHumanLock({
      ...config,
      root: config?.root ?? (typeof document !== "undefined" ? document : null),
    });
    guard.start();
    assessment.value = guard.assess();
    off = guard.onVerdict((next) => {
      assessment.value = next;
    });
    timer = setInterval(() => {
      if (guard) assessment.value = guard.assess();
    }, 1000);
  });

  onUnmounted(() => {
    off?.();
    off = null;
    if (timer) clearInterval(timer);
    timer = null;
    guard?.destroy();
    guard = null;
  });

  return {
    assessment,
    refresh: () => {
      if (guard) assessment.value = guard.assess();
    },
    report: async () => (guard ? guard.report() : null),
    getGuard: () => guard,
  };
}
