import { useCallback, useEffect, useRef, useState } from "react";
import type { HumanLockUserConfig } from "../config.js";
import { createHumanLock, type HumanLock } from "../engine.js";
import type { Assessment, SignedTrace } from "../types.js";

export interface UseHumanLockResult {
  /** The live guard. Null until after the first client render. */
  guard: HumanLock | null;
  /** Most recent assessment; refreshed on a 1s cadence and on honeypot hits. */
  assessment: Assessment | null;
  /** Force an immediate re-assessment. */
  refresh: () => void;
  /** Produce a signed trace, or null when no `sessionKey` was configured. */
  report: () => Promise<SignedTrace | null>;
}

/**
 * React binding.
 *
 * ```tsx
 * function StartExam() {
 *   const { assessment, report } = useHumanLock({ sessionKey: key });
 *   const risky = shouldChallenge(assessment ?? EMPTY);
 *   ...
 * }
 * ```
 */
export function useHumanLock(config?: HumanLockUserConfig): UseHumanLockResult {
  const guardRef = useRef<HumanLock | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const [guard, setGuard] = useState<HumanLock | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);

  useEffect(() => {
    const instance = createHumanLock({
      ...configRef.current,
      root: configRef.current?.root ?? (typeof document !== "undefined" ? document : null),
    });
    instance.start();
    guardRef.current = instance;
    setGuard(instance);
    setAssessment(instance.assess());

    const off = instance.onVerdict(setAssessment);
    const timer = setInterval(() => setAssessment(instance.assess()), 1000);

    return () => {
      off();
      clearInterval(timer);
      instance.destroy();
      guardRef.current = null;
      setGuard(null);
    };
  }, []);

  const refresh = useCallback(() => {
    if (guardRef.current) setAssessment(guardRef.current.assess());
  }, []);

  const report = useCallback(async () => {
    if (!guardRef.current) return null;
    return guardRef.current.report();
  }, []);

  return { guard, assessment, refresh, report };
}
