/**
 * Monetization provider + hooks (CORE FILE — overwritten on blueprint re-sync).
 *
 * Mount <MonetizationProvider appUserId={user?.id ?? null}> once, INSIDE
 * <AccountsProvider> (it needs the account id to alias purchases) and above
 * the UI. Everything degrades safely when unconfigured: `available` is false,
 * `isPlus` is false, and every gate resolves open, so builds without store
 * keys behave exactly like today's free app.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getEntitlementState,
  getPlusPackages,
  identify,
  init,
  isMonetizationConfigured,
  purchase as clientPurchase,
  resetIdentity,
  restore as clientRestore,
  subscribe,
} from './client';
import {applyPlanOverride, planOverride, subscribePlanOverride, type DevPlan} from './dev-plan';
import {isFeatureUnlocked} from './entitlements';
import type {PlusFeature} from './gates';
import {
  UNCONFIGURED_STATE,
  type EntitlementState,
  type PlusPackage,
  type PurchaseOutcome,
  type RestoreOutcome,
} from './types';

type MonetizationApi = {
  /** True when store keys are configured and Plus is actually for sale. */
  available: boolean;
  isPlus: boolean;
  /** ISO expiry of the current entitlement; null for lifetime or none. */
  expiresAt: string | null;
  /** Purchasable packages (empty until loaded / when unavailable). */
  packages: PlusPackage[];
  loadingPackages: boolean;
  /** (Re)fetch offerings; call when presenting the paywall. */
  refreshPackages: () => Promise<void>;
  purchase: (pkg: PlusPackage) => Promise<PurchaseOutcome>;
  restore: () => Promise<RestoreOutcome>;
};

const MonetizationContext = createContext<MonetizationApi | null>(null);

export function MonetizationProvider({
  children,
  appUserId,
}: {
  children: React.ReactNode;
  /** The signed-in account id (Supabase user id), or null when signed out. */
  appUserId: string | null;
}) {
  const [state, setState] = useState<EntitlementState>(UNCONFIGURED_STATE);
  const [packages, setPackages] = useState<PlusPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const lastUserIdRef = useRef<string | null>(null);
  // Fences BOTH async entitlement writers (initial fetch, identity bridge):
  // the newest generation owns the state, so a slow anonymous fetch cannot
  // overwrite the signed-in answer and a rapid account switch cannot expose
  // the previous identity's entitlement (Codex finding).
  const generationRef = useRef(0);

  useEffect(() => {
    init();
    if (!isMonetizationConfigured()) {
      return;
    }
    // FAIL CLOSED while configured: gates must not be open in the window
    // before the first CustomerInfo resolves (the SDK answers from its local
    // cache in milliseconds, so a real Plus reader sees nothing relock). The
    // old UNCONFIGURED initial state resolved gates open during that window,
    // which a stale closure could then keep forever (Codex finding).
    setState({isPlus: false, expiresAt: null, configured: true});
    // `cancelled` covers UNMOUNT (and keeps the ref out of cleanup, which the
    // hooks lint rightly objects to); the generation covers being SUPERSEDED
    // by the identity bridge below. Both are needed: one is about this
    // component's life, the other about which answer is newest.
    let cancelled = false;
    const generation = ++generationRef.current;
    void getEntitlementState().then(next => {
      if (!cancelled && generationRef.current === generation) {
        setState(next);
      }
    });
    const unsubscribe = subscribe(next => {
      // The SDK's own listener is always current-truth.
      if (!cancelled) {
        setState(next);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Identity bridge: alias anonymous purchases on sign-in, detach on sign-out.
  useEffect(() => {
    if (!isMonetizationConfigured()) {
      return;
    }
    const previous = lastUserIdRef.current;
    lastUserIdRef.current = appUserId;
    if (appUserId === previous) {
      return;
    }
    const generation = ++generationRef.current;
    void (async () => {
      if (appUserId) {
        await identify(appUserId);
      } else if (previous) {
        await resetIdentity();
      }
      const next = await getEntitlementState();
      if (generationRef.current === generation) {
        setState(next);
      }
    })();
  }, [appUserId]);

  const refreshPackages = useCallback(async () => {
    if (!isMonetizationConfigured()) {
      return;
    }
    setLoadingPackages(true);
    try {
      setPackages(await getPlusPackages());
    } finally {
      setLoadingPackages(false);
    }
  }, []);

  const purchase = useCallback(async (pkg: PlusPackage) => {
    const outcome = await clientPurchase(pkg.identifier);
    if (outcome.status === 'purchased') {
      setState(outcome.state);
    }
    return outcome;
  }, []);

  const restore = useCallback(async () => {
    const outcome = await clientRestore();
    if (outcome.status === 'restored') {
      setState(outcome.state);
    }
    return outcome;
  }, []);

  // APP EDIT (upstream to apps-tooling): the developer plan override. Nothing
  // can set it outside the developer console, whose routes do not exist in a
  // store build, so applyPlanOverride is the identity function there. Details
  // and the safety argument: ./dev-plan.ts.
  const [devPlan, setDevPlan] = useState<DevPlan | null>(() => planOverride());
  useEffect(() => subscribePlanOverride(() => setDevPlan(planOverride())), []);

  const api = useMemo<MonetizationApi>(
    () =>
      applyPlanOverride(
        {
          available: state.configured,
          isPlus: state.isPlus,
          expiresAt: state.expiresAt,
          packages,
          loadingPackages,
          refreshPackages,
          purchase,
          restore,
        },
        devPlan,
      ),
    [state, packages, loadingPackages, refreshPackages, purchase, restore, devPlan],
  );

  return (
    <MonetizationContext.Provider value={api}>{children}</MonetizationContext.Provider>
  );
}

export function usePlus(): MonetizationApi {
  const ctx = useContext(MonetizationContext);
  if (!ctx) {
    throw new Error('usePlus must be used within <MonetizationProvider>');
  }
  return ctx;
}

/**
 * Gate check for one Plus feature. Unconfigured builds always return
 * unlocked; configured builds require the entitlement. Call sites present
 * the paywall when locked (see PaywallSheet).
 */
export function useFeatureGate(feature: PlusFeature): {unlocked: boolean} {
  const {available, isPlus, expiresAt} = usePlus();
  return {
    unlocked: isFeatureUnlocked(
      {configured: available, isPlus, expiresAt},
      feature,
    ),
  };
}
