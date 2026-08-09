/**
 * The review ask: who gets asked for a store rating, when, and on which
 * platform's terms.
 *
 * The decision rules are pure and live in src/data/reviewLedger.ts; this
 * module owns persistence, the platform split, and the session cap.
 *
 * THE SPLIT (deliberate, recorded in docs/decisions/ios-android-differences.md):
 * iOS shows our own RateSheet first — 5 stars go on to Apple's sheet plus a
 * guaranteed store link, 1–4 become in-app feedback. Android calls the Play
 * in-app review card DIRECTLY, with no question before it, because Google
 * Play's In-App Review guidelines prohibit ANY pre-question (sentiment or
 * predicted rating included) and the FTC treats filtered review solicitation
 * as a violation. Do not "unify" these flows; the asymmetry is the compliance.
 *
 * Spec: docs/superpowers/specs/2026-08-01-review-prompt-design.md.
 */
import {Linking, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {track} from '../analytics';
import {
  parseLedger,
  shouldAsk,
  type ReviewLedgerState,
} from '../../src/data/reviewLedger';

const STORAGE_KEY = '@daily_book_review_ledger';

/**
 * The store-review SDK, loaded LAZILY and defensively (the translate.ts
 * lesson): expo modules resolve their native half at import time, and a
 * binary built before expo-store-review existed — every install of an older
 * TestFlight build — would crash AT APP START on a static import. A missing
 * module must read as "review ask unavailable", never a crash.
 */
type StoreReviewSdk = typeof import('expo-store-review');
let sdk: StoreReviewSdk | null | undefined;
function getStoreReview(): StoreReviewSdk | null {
  if (sdk === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      sdk = require('expo-store-review') as StoreReviewSdk;
    } catch {
      sdk = null;
    }
  }
  return sdk;
}

/** What put the sheet on screen. 'dev' is the developer switch. */
export type ReviewTrigger = 'book_finished' | 'goal_reached' | 'dev';

export interface ReviewSheetRequest {
  trigger: ReviewTrigger;
}

type Listener = (req: ReviewSheetRequest) => void;
const listeners = new Set<Listener>();

/** One attempt per app session, however many books get finished in it. */
let askedThisSession = false;

/** The host component (App.tsx) listens; there is exactly one sheet. */
export function subscribeReviewSheet(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function readLedger(): Promise<ReviewLedgerState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  return parseLedger(raw, new Date().toISOString());
}

async function writeLedger(state: ReviewLedgerState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

/**
 * A qualifying happy moment. The ledger decides whether it becomes an ask;
 * most calls do nothing, by design.
 */
export async function requestReviewAsk(trigger: Exclude<ReviewTrigger, 'dev'>): Promise<void> {
  if (askedThisSession) {
    return;
  }
  const ledger = await readLedger();
  if (!shouldAsk(ledger, new Date().toISOString())) {
    return;
  }
  // The store must be reachable on both platforms: on Android the ask IS the
  // Play card, and on iOS a 5-star tap heads to Apple's sheet next. A device
  // with no store (sideload) has nowhere to send anyone.
  const available = await getStoreReview()?.isAvailableAsync().catch(() => false);
  if (!available) {
    return;
  }
  askedThisSession = true;
  await writeLedger({...ledger, asks: [...ledger.asks, new Date().toISOString()]});

  if (Platform.OS === 'ios') {
    track('Review Prompt Shown', {trigger, flow: 'gate'});
    listeners.forEach(fn => fn({trigger}));
    return;
  }
  // Android: no question before the rating flow, ever. Play draws its own
  // card and manages its own quota; this call may quietly show nothing.
  track('Review Prompt Shown', {trigger, flow: 'native'});
  await getStoreReview()?.requestReview().catch(() => {});
}

/** The developer switch: run the real ask surface now, ledger untouched.
 *  On iOS that is our sheet; on Android there is no sheet to show (the gate
 *  is prohibited there), so the checkable thing is the Play card itself. */
export async function forceShowReviewSheet(): Promise<void> {
  if (Platform.OS === 'android') {
    await getStoreReview()?.requestReview().catch(() => {});
    return;
  }
  listeners.forEach(fn => fn({trigger: 'dev'}));
}

/** The reader rated (5 stars on the gate, or Settings → Rate DailyBook).
 *  From here on the app never asks again. */
export async function markRated(): Promise<void> {
  const ledger = await readLedger();
  await writeLedger({...ledger, ratedAt: new Date().toISOString()});
}

/** The reader told us what they think instead; 180 days of quiet. */
export async function recordFeedbackGiven(): Promise<void> {
  const ledger = await readLedger();
  await writeLedger({...ledger, feedbackAt: new Date().toISOString()});
}

/** Developer switch: wipe the ledger so flows can be re-tested. */
export async function resetReviewLedger(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  askedThisSession = false;
}

/**
 * Tests only: a new app session without touching the stored ledger.
 * `jest.isolateModules` cannot stand in for this — it would also hand the
 * module private copies of the AsyncStorage and Platform mocks, so
 * persistence tests would pass against a storage no other code shares.
 */
export function _newSessionForTests(): void {
  askedThisSession = false;
}

// FILL THESE IN when installing the module. The App Store id is the numeric id
// from App Store Connect; the package name is the Android applicationId.
const IOS_APP_ID = '0000000000';
const ANDROID_PACKAGE = 'com.example.app';

/** Write-review page (iOS) / store listing (Android). User-initiated store
 *  visits are allowed on both platforms at any time. Resolved at call time:
 *  Platform.OS read at import time would freeze the wrong store into tests
 *  and into anything else that flips platforms. */
function storeReviewUrl(): string {
  return Platform.OS === 'android'
    ? `market://details?id=${ANDROID_PACKAGE}&showAllReviews=true`
    : `itms-apps://itunes.apple.com/app/id${IOS_APP_ID}?action=write-review`;
}

/**
 * The user-initiated store door: the Settings row and the gate's thank-you
 * link. Marks rated on the way out — a reader who walked to the store on
 * purpose must not be prompted again, whether or not they finish typing.
 */
export async function openStoreReviewPage(via: 'gate' | 'settings'): Promise<void> {
  track('Store Review Opened', {via});
  await markRated();
  try {
    await Linking.openURL(storeReviewUrl());
  } catch {
    // Android without the Play Store app (sideloads, some tablets): the
    // market:// scheme has no handler at all. The web listing still reaches
    // the review box. iOS never lands here (itms-apps always resolves).
    if (Platform.OS === 'android') {
      await Linking.openURL(
        `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`,
      ).catch(() => {});
    }
  }
}

/**
 * The native "ask for a rating" sheet, tried after a 5-star tap on the gate.
 * Fire-and-forget ON PURPOSE: the API cannot say whether Apple actually
 * showed anything (quota, TestFlight), which is why the thank-you state of
 * the sheet always carries the store link as the guaranteed path.
 */
export async function tryNativeReviewSheet(): Promise<void> {
  await getStoreReview()?.requestReview().catch(() => {});
}
