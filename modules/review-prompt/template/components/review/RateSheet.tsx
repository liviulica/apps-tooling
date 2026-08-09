import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
} from 'react-native';
import {Ionicons as Icon} from '@expo/vector-icons';
import {useTheme, goldSeal} from '../../src/theme';

// A sheet on a wide window (iPad) must cap and centre, or the card stretches to
// 1000pt. If the app has a layout module, take the constant from there.
const SHEET_MAX_WIDTH = 640;
import {track} from '../../lib/analytics';
import {
  markRated,
  recordFeedbackGiven,
  openStoreReviewPage,
  type ReviewTrigger,
} from '../../lib/review';
import {sendFeedback, FEEDBACK_MAX_LENGTH} from '../../lib/review/feedback';
import PrimaryButton from '../PrimaryButton';
import {serifItalic} from '../../utils/fonts';

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};

interface RateSheetProps {
  visible: boolean;
  trigger: ReviewTrigger;
  /** 'feedback' skips the stars: the Settings "Share feedback" door. */
  startAt?: 'stars' | 'feedback';
  /** Which door the reader came through; travels with the analytics. */
  via?: 'gate' | 'settings';
  onDismiss: () => void;
}

type Stage = 'stars' | 'feedback' | 'thanks' | 'thanksFeedback';

/**
 * The iOS rating gate (docs/decisions/review-prompt.md): five stars in, one
 * of three exits out. 5 stars → rated forever, Apple's own sheet attempted,
 * and a thank-you carrying the store link — the link is the GUARANTEED path,
 * because requestReview cannot say whether Apple showed anything. 1–4 stars →
 * a short feedback box that reaches us instead of the store. This sheet must
 * never render on Android (the host enforces it): Play prohibits any
 * pre-question before its rating flow.
 */
export default function RateSheet({visible, trigger, startAt = 'stars', via = 'gate', onDismiss}: RateSheetProps) {
  const {theme} = useTheme();
  const colors = theme.colors;
  const [stage, setStage] = useState<Stage>(startAt);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // A fresh presentation starts at the stars, whatever happened last time.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setStage(startAt);
      setStars(0);
      setNote('');
      setSendFailed(false);
    }
    wasVisible.current = visible;
  }, [visible, startAt]);

  const pickStars = useCallback(
    (n: number) => {
      setStars(n);
      track('Review Prompt Rated', {stars: n});
      if (n === 5) {
        // Rated: the app never asks again. The native StoreKit sheet is NOT
        // tried anymore (owner call): its display is unverifiable,
        // and stacking it under a thanks screen whose CTA is the store made
        // five-star readers face two asks in a row. One path now — the store
        // write-review page, as the primary button.
        void markRated();
        setStage('thanks');
      } else {
        setStage('feedback');
      }
    },
    [],
  );

  const submit = useCallback(async () => {
    const text = note.trim();
    if (!text || sending) {
      return;
    }
    setSending(true);
    setSendFailed(false);
    const ok = await sendFeedback(text);
    setSending(false);
    if (!ok) {
      // The reader's words stay in the box; losing them would be the one
      // unforgivable outcome of a network blip.
      setSendFailed(true);
      return;
    }
    track('Feedback Sent', {length: text.length, via});
    void recordFeedbackGiven();
    setStage('thanksFeedback');
  }, [note, sending, via]);

  const dismiss = useCallback(() => {
    if (stage === 'stars') {
      track('Review Prompt Dismissed', {trigger});
    }
    onDismiss();
  }, [stage, trigger, onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss}>
      <View style={[styles.overlay, {backgroundColor: colors.overlay}]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          importantForAccessibility="no"
          onPress={dismiss}
        />
        <View style={[styles.card, {backgroundColor: colors.surface}]} accessibilityViewIsModal>
          <View style={styles.handleClip}>
            <View style={[styles.handle, {backgroundColor: colors.separator}]} />
          </View>

          {stage === 'stars' && (
            <>
              <Text style={[styles.title, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                How is the app so far?
              </Text>
              <View style={styles.starRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={styles.starButton}
                    onPress={() => pickStars(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
                    <Icon
                      name={n <= stars ? 'star' : 'star-outline'}
                      size={34}
                      color={goldSeal}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.quietAction}
                onPress={dismiss}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Not now">
                <Text style={[styles.quietActionText, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                  Not now
                </Text>
              </TouchableOpacity>
            </>
          )}

          {stage === 'feedback' && (
            <>
              <Text style={[styles.title, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                What should we make better?
              </Text>
              <Text style={[styles.subtitle, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                This goes to the people who build the app, not to the store.
              </Text>
              <TextInput
                style={[styles.noteBox, {color: colors.text, borderColor: colors.separator, backgroundColor: colors.background}]}
                value={note}
                onChangeText={setNote}
                placeholder="Tell us in a sentence or two"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={FEEDBACK_MAX_LENGTH}
                accessibilityLabel="Your feedback"
              />
              {sendFailed && (
                <Text style={[styles.sendFailed, {color: colors.danger}]} maxFontSizeMultiplier={1.4}>
                  Couldn’t send just now. Your note is still here, try again in a moment.
                </Text>
              )}
              <PrimaryButton
                label="Send"
                onPress={() => {
                  void submit();
                }}
                working={sending}
                workingLabel="Sending your note"
                disabled={!note.trim()}
                accessibilityLabel="Send feedback"
              />
              <TouchableOpacity
                style={styles.quietAction}
                onPress={dismiss}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Close without sending">
                <Text style={[styles.quietActionText, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                  Maybe later
                </Text>
              </TouchableOpacity>
            </>
          )}

          {stage === 'thanks' && (
            <>
              <Text style={[styles.title, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                Thank you
              </Text>
              <Text style={[styles.thanksLine, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                If the app has earned its place, a review helps other people find it.
              </Text>
              {/* The store IS the default action (owner call):
                  the button a thanked reader presses without thinking should
                  produce the review, not dismiss the sheet. */}
              <PrimaryButton
                label="Write a review"
                onPress={() => {
                  void openStoreReviewPage('gate');
                  dismiss();
                }}
                accessibilityLabel="Write a review on the App Store"
              />
              <TouchableOpacity
                style={styles.quietAction}
                onPress={dismiss}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Not now">
                <Text style={[styles.quietActionText, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                  Not now
                </Text>
              </TouchableOpacity>
            </>
          )}

          {stage === 'thanksFeedback' && (
            <>
              <Text style={[styles.title, {color: colors.text}]} maxFontSizeMultiplier={1.4}>
                Thank you
              </Text>
              <Text style={[styles.thanksLine, {color: colors.textSecondary}]} maxFontSizeMultiplier={1.4}>
                We read every note.
              </Text>
              <PrimaryButton label="Done" onPress={dismiss} accessibilityLabel="Done" />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {flex: 1, justifyContent: 'flex-end'},
  card: {
    // Caps + centers on wide windows (iPad); full-width on phones.
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },
  // Clip sandwich, same defect class as the WordDefinition handle: a small
  // fixed-size View can have its frame corrupted by recycling; the clipping
  // parent caps the damage at the handle's own size.
  handleClip: {height: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  handle: {width: 40, height: 4, borderRadius: 2},
  title: {fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 8},
  subtitle: {fontSize: 14, lineHeight: 20, textAlign: 'center'},
  starRow: {flexDirection: 'row', justifyContent: 'center', gap: 4, marginVertical: 8},
  starButton: {minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'},
  quietAction: {alignSelf: 'center', minHeight: 44, justifyContent: 'center'},
  quietActionText: {fontSize: 15, fontWeight: '600'},
  noteBox: {
    minHeight: 96,
    maxHeight: 160,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  sendFailed: {fontSize: 13, lineHeight: 18, textAlign: 'center'},
  // The one literary flourish: the thank-you reads in the book voice.
  thanksLine: {...serifItalic, fontSize: 16, lineHeight: 23, textAlign: 'center'},
});
