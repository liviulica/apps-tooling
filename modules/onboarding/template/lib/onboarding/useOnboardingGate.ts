/**
 * First-run gate (CORE FILE — overwritten on blueprint re-sync).
 *
 * Reads a first-run flag so the app root can render <OnboardingFlow> once, then
 * the app thereafter. Fail-open: a storage read error is treated as "already
 * onboarded" so a failure never traps the user in onboarding.
 *
 * Usage in the app root (inside your providers):
 *   const {onboarded, complete} = useOnboardingGate();
 *   if (onboarded === null) return <Splash/>;        // still reading the flag
 *   return onboarded ? <App/> : <OnboardingFlow ... onDone={complete} />;
 */
import {useCallback, useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useOnboardingGate(storageKey = '@app_onboarded') {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then(v => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true));
  }, [storageKey]);

  /** Mark onboarding complete and reveal the app. Pass extra side effects (e.g. suppressing a same-day launch ceremony) via onComplete. */
  const complete = useCallback(
    async (onComplete?: () => Promise<void> | void) => {
      try {
        await AsyncStorage.setItem(storageKey, '1');
        await onComplete?.();
      } catch {
        // Non-fatal: the flag re-reads false next launch at worst.
      }
      setOnboarded(true);
    },
    [storageKey],
  );

  return {onboarded, complete};
}
