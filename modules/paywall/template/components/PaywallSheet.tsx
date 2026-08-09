import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking, StyleSheet} from 'react-native';
import {BottomSheetModal, BottomSheetBackdrop, BottomSheetView} from '@gorhom/bottom-sheet';
import {Ionicons as Icon} from '@expo/vector-icons';
// App-side dependencies. Swap these for whatever the app already has: a theme
// hook, a display font, haptics, and the analytics `track`. `useSheetLayout`
// exists because a bottom sheet on a wide window (iPad) must be centred and
// width-capped by NUMERIC margins; if the app is phone-only, delete it and the
// `style={sheetLayout}` prop with it.
import {useTheme, useSheetLayout} from '../src/theme';
import {serif} from '../utils/fonts';
import {haptics} from '../utils/haptics';
import {track} from '../lib/analytics';
import {
  usePlus,
  annualSavingsPercent,
  GATE_COPY,
  PAYWALL_FEATURE_ORDER,
  type PlusFeature,
  type PlusPackage,
} from '../lib/monetization';

/**
 * Where the sheet was opened from. Analytics, and ONE piece of presentation:
 * a gate trigger lifts its own feature to the top of the benefit list, so the
 * reader who tapped a locked export sees the export benefit first.
 */
export type PaywallTrigger = 'profile' | 'onboarding' | `gate:${string}`;

interface PaywallSheetProps {
  visible: boolean;
  onDismiss: () => void;
  trigger: PaywallTrigger;
}

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};
// Apple's standard EULA satisfies the Terms link when there is no custom EULA.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
// MUST match the privacy policy URL in App Store Connect before the paywall
// goes live, and be a REAL reachable page (App Review checks the link).
const PRIVACY_URL = 'https://example.com/privacy';

/**
 * The Plus offer, as a bottom sheet (APP-OWNED FILE — yours to restyle).
 *
 * Rename the tier, rewrite every string, change the layout: this file is meant
 * to be edited. Five things must survive the edit, because App Review checks
 * four of them and the fifth is how you avoid lying to a customer:
 *
 *  1. The billed amount is the most prominent price element, and every price
 *     is the store's own `priceString`, never composed (3.1.2). A "$3.33 per
 *     month, billed annually" line divides and reformats a price — that is
 *     composing one, and this sheet deliberately does not do it.
 *  2. Auto-renew wording for subscriptions, and NEVER for a lifetime product.
 *     `renewalNote` keeps them apart.
 *  3. Restore purchases, Terms and Privacy, all reachable and all real pages.
 *  4. A free trial is stated ONLY when `pkg.trial` is set, which happens only
 *     when the store said this customer is eligible (see packages.ts). Do not
 *     hardcode "1 week free" anywhere in here.
 *  5. Value claims carry evidence: the savings chip renders only when the
 *     percentage is computable from real store prices, and disappears
 *     otherwise. A "Best value" fallback is a claim with nothing behind it.
 */
export default function PaywallSheet({visible, onDismiss, trigger}: PaywallSheetProps) {
  const {theme} = useTheme();
  const sheetLayout = useSheetLayout();
  const colors = theme.colors;
  const sheetRef = useRef<BottomSheetModal>(null);
  const {packages, loadingPackages, refreshPackages, purchase, restore, isPlus} = usePlus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
      track('Paywall Viewed', {trigger});
      void refreshPackages();
    } else {
      sheetRef.current?.dismiss();
    }
    // trigger is bound to the open that showed the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, refreshPackages]);

  const selected =
    packages.find(p => p.identifier === selectedId) ??
    packages.find(p => p.packageType === 'annual') ??
    packages[0] ??
    null;

  // "Save 44%" is computed from the store's own numbers; shown on the annual
  // card as evidence where "Best value" would be a claim.
  const savings = useMemo(() => annualSavingsPercent(packages), [packages]);

  // A gate trigger leads with the feature the reader just reached for.
  const featureOrder = useMemo<PlusFeature[]>(() => {
    const key = trigger.startsWith('gate:') ? (trigger.slice(5) as PlusFeature) : null;
    if (key && key in GATE_COPY) {
      return [key, ...PAYWALL_FEATURE_ORDER.filter(f => f !== key)];
    }
    return PAYWALL_FEATURE_ORDER;
  }, [trigger]);

  // One outcome event AND one onDismiss per presentation (review findings):
  // the native sheet's own onDismiss re-enters after the close button, and it
  // also fires after a successful purchase/restore already reported its
  // outcome. Unguarded, that double-counted the funnel exit — and ran the
  // OWNER's dismiss handler twice, which for onboarding meant completing the
  // flow twice (two storage writes racing). Every path out of the sheet goes
  // through fireDismiss, so the owner hears about a presentation exactly once.
  const outcomeReported = useRef(false);
  const dismissFired = useRef(false);
  useEffect(() => {
    if (visible) {
      outcomeReported.current = false;
      dismissFired.current = false;
    }
  }, [visible]);
  const fireDismiss = useCallback(() => {
    if (dismissFired.current) {
      return;
    }
    dismissFired.current = true;
    onDismiss();
  }, [onDismiss]);
  const dismiss = useCallback(() => {
    if (!outcomeReported.current) {
      outcomeReported.current = true;
      track('Paywall Dismissed', {trigger});
    }
    fireDismiss();
  }, [fireDismiss, trigger]);

  const handlePurchase = useCallback(async () => {
    if (!selected || busy) {
      return;
    }
    haptics.selection();
    setBusy(true);
    track('Purchase Started', {package_type: selected.packageType, trigger});
    const outcome = await purchase(selected);
    setBusy(false);
    if (outcome.status === 'purchased') {
      track('Purchase Completed', {package_type: selected.packageType, trigger});
      outcomeReported.current = true;
      haptics.success();
      fireDismiss();
    } else if (outcome.status === 'cancelled') {
      track('Purchase Failed', {package_type: selected.packageType, reason: 'cancelled', trigger});
    } else {
      track('Purchase Failed', {package_type: selected.packageType, reason: 'error', trigger});
      Alert.alert('Something went wrong', outcome.message);
    }
  }, [selected, busy, purchase, fireDismiss, trigger]);

  const handleRestore = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    const outcome = await restore();
    setBusy(false);
    if (outcome.status === 'restored') {
      track('Purchases Restored', {found: outcome.found});
      outcomeReported.current = true;
      if (outcome.found) {
        haptics.success();
        fireDismiss();
      } else {
        Alert.alert('Nothing to restore', 'No previous purchase was found for this store account.');
      }
    } else {
      Alert.alert('Something went wrong', outcome.message);
    }
  }, [busy, restore, fireDismiss]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.3} />
    ),
    [],
  );

  return (
    <BottomSheetModal
      style={sheetLayout}
      ref={sheetRef}
      onDismiss={dismiss}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handleHidden}
      backgroundStyle={{backgroundColor: colors.surface}}
      enableDynamicSizing
    >
      <BottomSheetView style={styles.panel} accessibilityViewIsModal>
        <View style={styles.titleBar}>
          <Text style={[styles.eyebrow, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
            Plus
          </Text>
          <TouchableOpacity
            style={[styles.close, {backgroundColor: colors.separator}]}
            onPress={dismiss}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Not now">
            <Icon name="close" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.goldRule, {backgroundColor: colors.gold}]} />
        <Text style={[styles.headline, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
          Keep going
        </Text>
        <Text style={[styles.explainer, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
          Everything the app does stays free. Plus adds tools, and keeps a small
          team building.
        </Text>

        <View style={styles.featureList}>
          {featureOrder.map(key => {
            const copy = GATE_COPY[key];
            return (
              <View key={key} style={styles.featureRow}>
                <Icon name={copy.icon as any} size={17} color={colors.gold} />
                <Text style={[styles.featureText, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                  {copy.benefit}
                  {copy.upcoming ? (
                    <Text style={{color: colors.textSecondary}}> (coming soon)</Text>
                  ) : null}
                </Text>
              </View>
            );
          })}
        </View>

        {isPlus ? (
          <View style={[styles.card, {backgroundColor: colors.background}]}>
            <Icon name="checkmark-circle" size={20} color={colors.success} />
            <Text style={[styles.thanksText, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
              You already have Plus. Thank you for the support.
            </Text>
          </View>
        ) : loadingPackages || packages.length === 0 ? (
          <View style={styles.loadingRow}>
            {loadingPackages ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={[styles.loadingText, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                Plans aren’t available right now. Please try again later.
              </Text>
            )}
          </View>
        ) : (
          <>
            <View style={styles.packageRow}>
              {packages.map(pkg => {
                const isSelected = selected?.identifier === pkg.identifier;
                return (
                  <TouchableOpacity
                    key={pkg.identifier}
                    style={[
                      styles.packageCard,
                      {borderColor: isSelected ? colors.accent : colors.separator},
                      isSelected && {backgroundColor: colors.accent + '14'},
                    ]}
                    onPress={() => {
                      haptics.light();
                      setSelectedId(pkg.identifier);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{selected: isSelected}}
                    accessibilityLabel={`${packageTitle(pkg)}, ${pkg.priceString} ${pkg.periodLabel}${
                      pkg.trial ? `, ${pkg.trial} free to start` : ''
                    }`}>
                    {pkg.packageType === 'annual' && savings != null && (
                      // Evidence or nothing: with no computable saving (a lone
                      // annual package, or annual NOT cheaper than 12 months)
                      // there is no chip, because "Best value" would then be
                      // an unsupported claim (a review finding).
                      <View style={[styles.valueChip, {backgroundColor: colors.gold + '22'}]}>
                        <Text style={[styles.valueChipText, {color: colors.gold}]} maxFontSizeMultiplier={1.2}>
                          {`Save ${savings}%`}
                        </Text>
                      </View>
                    )}
                    <Text style={[styles.packageTitle, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                      {packageTitle(pkg)}
                    </Text>
                    <Text style={[styles.packagePrice, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                      {pkg.priceString}
                    </Text>
                    <Text style={[styles.packagePeriod, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                      {pkg.periodLabel}
                    </Text>
                    {pkg.trial != null && (
                      <Text style={[styles.trialLine, {color: colors.gold}]} maxFontSizeMultiplier={1.2}>
                        {pkg.trial} free
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.cta, {backgroundColor: colors.accent}]}
              disabled={busy || !selected}
              onPress={handlePurchase}
              accessibilityRole="button"
              accessibilityLabel={ctaLabel(selected)}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Text style={[styles.ctaText, {color: colors.accentText}]} maxFontSizeMultiplier={1.4}>
                  {ctaLabel(selected)}
                </Text>
              )}
            </TouchableOpacity>

            {selected && (
              <Text style={[styles.renewalNote, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                {renewalNote(selected)}
              </Text>
            )}
          </>
        )}

        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={handleRestore}
            disabled={busy}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases">
            <Text style={[styles.footerLink, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
              Restore purchases
            </Text>
          </TouchableOpacity>
          <Text style={[styles.footerDot, {color: colors.textSecondary}]}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            hitSlop={HIT_SLOP}
            accessibilityRole="link"
            accessibilityLabel="Terms of use">
            <Text style={[styles.footerLink, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
              Terms of use
            </Text>
          </TouchableOpacity>
          <Text style={[styles.footerDot, {color: colors.textSecondary}]}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            hitSlop={HIT_SLOP}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy">
            <Text style={[styles.footerLink, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
              Privacy policy
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function packageTitle(pkg: PlusPackage): string {
  switch (pkg.packageType) {
    case 'monthly':
      return 'Monthly';
    case 'annual':
      return 'Yearly';
    case 'lifetime':
      return 'Lifetime';
  }
}

/**
 * The button names the action and its cost — "Continue" alone made readers
 * treat it as disabled. Price text is the store's own string, verbatim.
 */
function ctaLabel(pkg: PlusPackage | null): string {
  if (!pkg) {
    return 'Continue';
  }
  if (pkg.trial) {
    return `Try ${pkg.trial} free`;
  }
  return `Continue for ${pkg.priceString}`;
}

/**
 * The line under the button carries the store-rule disclosures: what renews,
 * at what store price, and that a trial converts unless cancelled. Lifetime
 * gets the opposite promise, stated rather than implied.
 */
function renewalNote(pkg: PlusPackage): string {
  if (pkg.packageType === 'lifetime') {
    return 'One payment, yours for good. Nothing renews.';
  }
  const period = pkg.packageType === 'annual' ? 'yearly' : 'monthly';
  if (pkg.trial) {
    return `${pkg.trial} free, then renews ${period} at ${pkg.priceString} until cancelled in your store settings.`;
  }
  return `Renews ${period} at ${pkg.priceString} until cancelled in your store settings.`;
}

const styles = StyleSheet.create({
  handleHidden: {display: 'none'},
  panel: {paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28},
  titleBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  // Eyebrows uppercase via textTransform (design system §2), not literals.
  eyebrow: {fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase'},
  close: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  goldRule: {width: 44, height: 3, borderRadius: 2, marginTop: 16},
  headline: {...serif, fontSize: 26, fontWeight: '700', marginTop: 10},
  explainer: {fontSize: 14, lineHeight: 20, marginTop: 8},
  featureList: {marginTop: 14, gap: 10},
  featureRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  featureText: {fontSize: 14, flex: 1, lineHeight: 19},
  card: {flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginTop: 16, gap: 10},
  thanksText: {fontSize: 14, flex: 1, lineHeight: 19},
  loadingRow: {marginTop: 18, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  loadingText: {fontSize: 13},
  packageRow: {flexDirection: 'row', gap: 8, marginTop: 16},
  packageCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    minHeight: 92,
    justifyContent: 'center',
  },
  valueChip: {borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6},
  valueChipText: {fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase'},
  packageTitle: {fontSize: 13, fontWeight: '600'},
  // The billed amount is the most prominent price element (App Review 3.1.2).
  packagePrice: {fontSize: 17, fontWeight: '800', marginTop: 2},
  packagePeriod: {fontSize: 11, marginTop: 2},
  trialLine: {fontSize: 11, fontWeight: '700', marginTop: 3},
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 14,
    marginTop: 14,
  },
  ctaText: {fontSize: 16, fontWeight: '700'},
  renewalNote: {fontSize: 11, lineHeight: 15, marginTop: 10, textAlign: 'center'},
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    minHeight: 24,
  },
  footerLink: {fontSize: 12, fontWeight: '600'},
  footerDot: {fontSize: 12},
});
