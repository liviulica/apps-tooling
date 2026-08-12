import React, {useCallback, useRef, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {Ionicons as Icon} from '@expo/vector-icons';

import {useTheme} from '../../src/theme';
import {serif} from '../../utils/fonts';
import {track} from '../../lib/analytics';
import {haptics} from '../../utils/haptics';
import PrimaryButton from '../PrimaryButton';

/**
 * The soft ask, before the system one.
 *
 * iOS grants exactly ONE notification prompt per install, ever. Raising it cold
 * spends that single chance on a reader who has no idea what they are agreeing
 * to, and a no is then permanent unless they go into iOS Settings, which almost
 * nobody does.
 *
 * So this screen asks first, in our own words, and only raises the system prompt
 * for someone who has already said yes here. "Not now" costs nothing: the native
 * prompt is never spent, so the reader can be asked again another day.
 *
 * Owner's call, 2026-08-12, positioned AFTER the book picks and BEFORE the
 * preparing step — by then they have chosen books and have something to keep up
 * with, which is what makes the ask make sense.
 *
 * The illustration is DRAWN: a mock notification, showing the exact message the
 * app would send. Showing the real thing is the honest version of this pattern,
 * and this app bundles no images.
 */
export default function NotificationsStep({
  onDone,
}: {
  /**
   * Called once the reader has answered, with what they chose. `granted` is what
   * the SYSTEM said, so it is false when they accepted here and then declined the
   * native prompt.
   */
  onDone: (result: {asked: boolean; granted: boolean}) => void
}) {
  const {theme} = useTheme();
  const colors = theme.colors;
  const [busy, setBusy] = useState(false);
  /**
   * A REF, not the state above. setBusy does not apply until the next render, so
   * two taps in the same tick both read `busy === false` and both raise the
   * system prompt — which on iOS means burning the one prompt and answering
   * onboarding twice. The state is only there to show the button working.
   */
  const answered = useRef(false);

  const allow = useCallback(async () => {
    if (answered.current) {
      return;
    }
    answered.current = true;
    setBusy(true);
    haptics.selection();
    track('Notification Prompt Answered', {choice: 'allow'});
    // Loaded lazily and defensively: expo-notifications is a native module, and
    // a binary built before it existed must not crash on this screen.
    let granted = false;
    try {
      const Notifications = require('expo-notifications');
      const {status} = await Notifications.requestPermissionsAsync();
      granted = status === 'granted';
    } catch {
      granted = false;
    }
    track('Notification Permission Resolved', {granted});
    setBusy(false);
    onDone({asked: true, granted});
  }, [onDone]);

  const decline = useCallback(() => {
    if (answered.current) {
      return;
    }
    answered.current = true;
    haptics.selection();
    // The whole point of the pattern: the system prompt is NOT raised, so it
    // stays available for another day.
    track('Notification Prompt Answered', {choice: 'not_now'});
    onDone({asked: false, granted: false});
  }, [onDone]);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={[styles.title, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
          Keep up with your reading goals.
        </Text>

        {/* The message itself, so nobody agrees to something unseen. */}
        <View
          style={[styles.stage, {backgroundColor: colors.background}]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <View style={[styles.toast, {backgroundColor: colors.surface, borderColor: colors.separator}]}>
            <View style={[styles.appIcon, {backgroundColor: theme.colors.text}]}>
              <Text style={[serif, styles.appIconLetter, {color: colors.background}]} allowFontScaling={false}>
                D
              </Text>
            </View>
            <View style={styles.toastBody}>
              <Text style={[styles.toastTitle, {color: colors.text}]} numberOfLines={1} allowFontScaling={false}>
                Don’t lose your streak
              </Text>
              <Text style={[styles.toastText, {color: colors.textSecondary}]} numberOfLines={2} allowFontScaling={false}>
                7 days so far. A few pages keeps it going.
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.body, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
          One quiet reminder a day, around the time you usually read. Nothing
          else, and you can turn it off whenever you like.
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Allow notifications" onPress={allow} working={busy} />
        <TouchableOpacity
          style={styles.decline}
          onPress={decline}
          accessibilityRole="button"
          accessibilityLabel="Not now">
          <Text style={[styles.declineText, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
            Not now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, paddingHorizontal: 20, paddingBottom: 24, justifyContent: 'space-between'},
  top: {flex: 1, justifyContent: 'center'},
  title: {fontSize: 26, fontWeight: '800', marginBottom: 28},
  stage: {borderRadius: 16, padding: 16},
  toast: {flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center'},
  appIcon: {width: 34, height: 34, borderRadius: 8, justifyContent: 'center', alignItems: 'center'},
  appIconLetter: {fontSize: 17, lineHeight: 21},
  toastBody: {flex: 1},
  toastTitle: {fontSize: 13, fontWeight: '700'},
  toastText: {fontSize: 12, marginTop: 1},
  body: {fontSize: 14, lineHeight: 21, marginTop: 24},
  actions: {gap: 4},
  decline: {minHeight: 44, justifyContent: 'center', alignItems: 'center'},
  declineText: {fontSize: 15, fontWeight: '600'},
});
