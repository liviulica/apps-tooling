/**
 * Paywall sheet (APP-OWNED FILE — written once, never clobbered on re-sync).
 *
 * This is the worked example from DailyBook: adapt it to your app's design
 * system (theme hook, fonts, haptics, analytics import paths). What must
 * survive the adaptation, because App Review checks it (see
 * paywall-guidelines.md): store-localized prices only, the billed amount as
 * the most prominent price element, auto-renew wording, a Restore purchases
 * affordance, and working Terms + Privacy links.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking, StyleSheet} from 'react-native';
import {BottomSheetModal, BottomSheetBackdrop, BottomSheetView} from '@gorhom/bottom-sheet';
import {Ionicons as Icon} from '@expo/vector-icons';
import {useTheme} from '../src/theme';
import {serif} from '../utils/fonts';
import {haptics} from '../utils/haptics';
import {track} from '../lib/analytics';
import {usePlus, GATE_COPY, PAYWALL_FEATURE_ORDER, type PlusPackage} from '../lib/monetization';

/** Where the sheet was opened from; analytics only, never copy. */
export type PaywallTrigger = 'profile' | `gate:${string}`;

interface PaywallSheetProps {
  visible: boolean;
  onDismiss: () => void;
  trigger: PaywallTrigger;
}

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};
// Apple's standard EULA satisfies the Terms link when there is no custom EULA.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
// MUST match the privacy policy URL in App Store Connect before the paywall
// goes live (docs/monetization-setup-remaining.md).
const PRIVACY_URL = 'https://chargingpixels.com/dailybook-privacy';

/**
 * The DailyBook Plus offer: the bottom-sheet offer pattern (CompanionSheet),
 * with the gold rule + serif headline because a purchase is a ceremonial
 * moment. Store rules live here too: localized store prices only, billed
 * amount most prominent, restore + terms + privacy always present.
 */
export default function PaywallSheet({visible, onDismiss, trigger}: PaywallSheetProps) {
  const {theme} = useTheme();
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

  const dismiss = useCallback(() => {
    track('Paywall Dismissed', {trigger});
    onDismiss();
  }, [onDismiss, trigger]);

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
      haptics.success();
      onDismiss();
    } else if (outcome.status === 'cancelled') {
      track('Purchase Failed', {package_type: selected.packageType, reason: 'cancelled', trigger});
    } else {
      track('Purchase Failed', {package_type: selected.packageType, reason: 'error', trigger});
      Alert.alert('Something went wrong', outcome.message);
    }
  }, [selected, busy, purchase, onDismiss, trigger]);

  const handleRestore = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    const outcome = await restore();
    setBusy(false);
    if (outcome.status === 'restored') {
      track('Purchases Restored', {found: outcome.found});
      if (outcome.found) {
        haptics.success();
        onDismiss();
      } else {
        Alert.alert('Nothing to restore', 'No previous purchase was found for this store account.');
      }
    } else {
      Alert.alert('Something went wrong', outcome.message);
    }
  }, [busy, restore, onDismiss]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.3} />
    ),
    [],
  );

  return (
    <BottomSheetModal
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
            DailyBook Plus
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
          Keep the pages turning
        </Text>
        <Text style={[styles.explainer, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
          Every book in DailyBook is free, and stays free. Plus adds tools for
          your own library, and keeps a one-person app growing.
        </Text>

        <View style={styles.featureList}>
          {PAYWALL_FEATURE_ORDER.map(key => {
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
              You already have Plus. Thank you for keeping DailyBook going.
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
                    accessibilityLabel={`${packageTitle(pkg)}, ${pkg.priceString} ${pkg.periodLabel}`}>
                    {pkg.packageType === 'annual' && (
                      <View style={[styles.valueChip, {backgroundColor: colors.gold + '22'}]}>
                        <Text style={[styles.valueChipText, {color: colors.gold}]} maxFontSizeMultiplier={1.2}>
                          Best value
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
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.cta, {backgroundColor: colors.accent}]}
              disabled={busy || !selected}
              onPress={handlePurchase}
              accessibilityRole="button"
              accessibilityLabel="Continue with the selected plan">
              {busy ? (
                <ActivityIndicator size="small" color={colors.accentText} />
              ) : (
                <Text style={[styles.ctaText, {color: colors.accentText}]} maxFontSizeMultiplier={1.4}>
                  Continue
                </Text>
              )}
            </TouchableOpacity>

            {selected && selected.packageType !== 'lifetime' && (
              <Text style={[styles.renewalNote, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                {selected.packageType === 'annual'
                  ? `Renews yearly at ${selected.priceString} until cancelled in your store settings.`
                  : `Renews monthly at ${selected.priceString} until cancelled in your store settings.`}
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
