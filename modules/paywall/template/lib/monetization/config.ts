/**
 * Monetization config (CORE FILE — overwritten on blueprint re-sync).
 *
 * Public RevenueCat SDK keys per platform, from Expo public env vars so they
 * differ per app without code changes:
 *   EXPO_PUBLIC_REVENUECAT_IOS_KEY      — "appl_..." (App Store app)
 *   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY  — "goog_..." (Play Store app)
 *
 * These are publishable client keys, not secrets. When the key for the
 * current platform is missing, monetization is OFF for this build: nothing is
 * for sale and every feature gate stays open (see entitlements.ts). That is
 * the mechanism that lets this code merge and ship dark.
 */
import {Platform} from 'react-native';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

export const REVENUECAT_API_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
