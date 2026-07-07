/**
 * Onboarding flow shell (CORE FILE — overwritten on blueprint re-sync).
 *
 * A generic, config-driven first-run flow: you pass an ordered list of steps;
 * the shell handles the progress indicator, a per-step skip control (✕), the
 * fade between steps, and firing onDone after the last step. The STEP CONTENT
 * is app-specific and lives in your app (welcome, value props, taste pickers,
 * the account step, a preparing/handoff beat) — this file is just the engine.
 *
 * Theme: pass `tint` (active/accent) and `track` (inactive) colors so the shell
 * matches your app; both default to neutral grays.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  AccessibilityInfo,
  Text,
} from 'react-native';

export interface OnboardingStepApi {
  /** Advance to the next step (or finish, on the last step). */
  next: () => void;
  /** Go back to the previous step (no-op on the first). */
  back: () => void;
}

export interface OnboardingStep {
  /** Stable key, also reported to onStep for analytics. */
  key: string;
  /** Renders the step body. Call api.next() from your primary button. */
  render: (api: OnboardingStepApi) => React.ReactNode;
  /** Show a ✕ skip on this step (typically the account step). Skipping = next. */
  skippable?: boolean;
}

export interface OnboardingFlowProps {
  steps: OnboardingStep[];
  /** Called once, after the last step's next() (or a final step calling next). */
  onDone: () => void;
  /** Analytics hook: fires on each step becoming visible. */
  onStep?: (key: string, index: number) => void;
  /** Fires when a skippable step is dismissed via the ✕. */
  onSkip?: (key: string, index: number) => void;
  tint?: string;
  track?: string;
}

export function OnboardingFlow({
  steps,
  onDone,
  onStep,
  onSkip,
  tint = '#0A7EA4',
  track = '#D0D5DD',
}: OnboardingFlowProps) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const reduceRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(r => {
        reduceRef.current = r;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    onStep?.(steps[index].key, index);
    if (reduceRef.current) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const next = useCallback(() => {
    setIndex(i => {
      if (i >= steps.length - 1) {
        onDone();
        return i;
      }
      return i + 1;
    });
  }, [steps.length, onDone]);

  const back = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);

  const step = steps[index];
  const api = useMemo<OnboardingStepApi>(() => ({next, back}), [next, back]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <View key={s.key} style={[styles.dot, {backgroundColor: i === index ? tint : track}]} />
          ))}
        </View>
        {step.skippable && (
          <TouchableOpacity
            style={styles.close}
            onPress={() => {
              onSkip?.(step.key, index);
              next();
            }}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            accessibilityRole="button"
            accessibilityLabel="Skip this step">
            <Text style={[styles.closeGlyph, {color: track}]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <Animated.View style={[styles.body, {opacity: fade}]}>{step.render(api)}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {height: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8},
  dots: {flexDirection: 'row', gap: 8},
  dot: {width: 7, height: 7, borderRadius: 4},
  close: {position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center'},
  closeGlyph: {fontSize: 22, fontWeight: '400'},
  body: {flex: 1},
});
