/**
 * Analytics provider + hook (CORE FILE — overwritten on blueprint re-sync).
 *
 * Mount <AnalyticsProvider> once near the root of the app. It initializes the
 * client and emits app-lifecycle events automatically. Components read the API
 * via useAnalytics().
 */
import React, {createContext, useContext, useEffect, useRef} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import * as client from './client';

type AnalyticsApi = {
  track: typeof client.track;
  screen: typeof client.screen;
  setUserProperties: typeof client.setUserProperties;
  reset: typeof client.reset;
  setEnabled: typeof client.setEnabled;
  flush: typeof client.flush;
};

const AnalyticsContext = createContext<AnalyticsApi | null>(null);

export function AnalyticsProvider({children}: {children: React.ReactNode}) {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    client.init();
    client.track('app_opened');

    const subscription = AppState.addEventListener('change', next => {
      const prev = appState.current;
      appState.current = next;
      if (/inactive|background/.test(prev) && next === 'active') {
        client.track('app_foregrounded');
      } else if (prev === 'active' && /inactive|background/.test(next)) {
        client.track('app_backgrounded');
        void client.flush();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <AnalyticsContext.Provider value={client}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsApi {
  const ctx = useContext(AnalyticsContext);
  if (!ctx) {
    throw new Error('useAnalytics must be used within <AnalyticsProvider>');
  }
  return ctx;
}
