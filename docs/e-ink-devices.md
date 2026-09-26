# Shipping to an e-ink Android tablet, found the expensive way

Cross-cutting notes for putting an Expo / RN app on an e-ink device. Grounded
in one real target: a Supernote Nomad (Android 11, arm64, 1404x1872 panel, no
Play Store and no Play Services, no speaker, no volume keys). Everything here
cost real debugging time; almost none of it is in the RN docs, because the
docs assume a screen that can redraw sixty times a second.

The one sentence that generalises: **an e-ink panel repaints the whole screen
or nothing, and a repaint is visible, slow and expensive.** Every rule below
is that sentence applied somewhere.

## A hung app looks exactly like a working one

**Symptom.** The owner reports "it crashed". The panel shows a perfectly
normal screen. Nothing responds to taps. There is no crash in Crashlytics, no
tombstone, no ANR in the log.

**Mechanism.** The panel holds its last image with no power, so a wedged UI
thread and a healthy idle app are pixel-identical. On a phone you would see a
frozen animation or an ANR dialog; here you see a poster of the app. Android
also will not raise an ANR unless an input event goes unanswered while the
system is watching, which a sleeping panel plus a background app dodges.

**Fix.** Never diagnose an e-ink freeze from a screenshot. Ask the JS thread
what it is doing:

```sh
adb shell "top -H -b -n 1 -p $(adb shell pidof com.example.app) | head -20"
# a healthy idle app:   mqt_v_js  0.0%
# a wedged one:         mqt_v_js  96.5%  R   21:13.29
```

`mqt_v_js` at ~100% in state `R` is a JavaScript infinite loop. Corroborate
with `adb logcat | grep "concurrent copying GC"`: a steady heartbeat of GCs
freeing the same amount every N seconds, forever, is a render or effect loop,
and the allocation rate tells you how heavy each lap is. `dumpsys meminfo
<pid>` will show the process growing.

**Related trap.** Because you cannot see the freeze, you also cannot see
whether a tap landed. Confirm every step of a scripted drill with a fresh
`screencap`; roughly one tap in five did not register in our runs, and a
missed tap silently invalidates the experiment you are about to reason from.

## Only the focused screen may drive a global singleton

**Symptom.** Opening a second document (or recording, or anything with one
shared engine behind it) pegs the JS thread forever. Opening the same one
FIRST after a launch is fine, which sends you chasing the data instead of the
sequence.

**Mechanism.** A stack navigator keeps the previous screen mounted. If a
screen drives a global store from an effect that re-runs whenever the store's
subject changes (the natural way to write "reclaim the player when something
else takes it"), two mounted screens fight: each re-asserts its own subject,
each emit re-triggering the other. Tens of laps a second, for ever.

**Fix.** Gate the effect on focus:

```tsx
const focused = useIsFocused();
useEffect(() => {
  if (!focused) {return;}
  if (store.currentId !== id) {void store.load(id);}
}, [focused, store, id, store.currentId]);
```

**Why it belongs in an e-ink note.** The bug is ordinary React Navigation, but
the panel is what makes it a two-hour hunt: no jank, no spinner, no partial
paint, no crash report. The device gives you one bit of information, and it is
the wrong one.

## Nothing scrolls

**Symptom.** A `FlatList` fling smears the panel and settles somewhere the
reader did not choose.

**Mechanism.** Every frame of momentum is a full-screen repaint on hardware
that manages a few per second.

**Fix.** Fixed-height rows and a pager: measure the box once, fit a whole
number of rows, move a page at a time on two buttons. One repaint per press,
and the page you land on is the page you asked for. Do not measure rows
individually; that is the scrolling problem in a different coat.

## Nothing ticks

**Symptom.** Battery drains and the panel flickers continuously while a timer
or a playback position is on screen.

**Mechanism.** A readout that changes every second is a repaint every second.

**Fix.** Render coarser than the data changes. A clock shows minutes, not
seconds: React still re-renders 60 times a minute, but the string it hands the
native side is identical 59 of those times, so reconciliation produces no host
update and the panel never redraws. Progress bars go in tenths, and return the
SAME state object when the rounded value has not moved so React bails out of
the render entirely:

```ts
setState(prev => (prev?.tenth === tenth ? prev : {tenth}));
```

## No gray, no spinners, no opacity

**Symptom.** Mid-tones dither into visible noise; spinners strobe; opacity
feedback on press produces a smear.

**Fix.** Pure black on white. Pressed state INVERTS (black fill, white text).
Loading is a word, not an animation. Borders instead of fills, 2px so they
survive the panel's contrast.

## Per-device state must never sync

**Symptom.** Turning on the e-ink layout on the tablet turns it on for the
phone, or the tablet's text size fights the phone's.

**Mechanism.** The obvious home for "display mode" is the synced settings
namespace, and sync is exactly wrong for it: a display mode belongs to one
piece of hardware.

**Fix.** Separate local keys for anything that describes the device rather
than the person (the mode, the first-run flag for that surface, the reader's
text size on that panel). Never a field on the synced settings object, and
never the theme preference.

## The hardware may be missing controls you assume

**Symptom.** With Bluetooth headphones on, there is no way to change the
volume: the tablet has a power button, a slide bar, and nothing else.

**Mechanism.** You inherit the platform's UI assumptions (volume keys, a
speaker, a back gesture) and this class of device honours few of them.

**Fix.** Provide the control yourself, and move the SYSTEM value, not your
player's gain. A player gain can only attenuate below the system level, so
with the system at 8 of 15 a "louder" button that touches gain does nothing.
On Android that is `AudioManager.STREAM_MUSIC` through a small native module;
it is also the value Bluetooth absolute volume follows, so the headset's own
buttons and your buttons move the same number. Step it (one system step per
tap, one repaint per tap) rather than offering a slider, for the same reason
there is no scrubber.

Audit the same way for: no speaker (audio still works over Bluetooth), no
colour, no refresh rate for video, no camera, no Play Services (so no Google
sign-in, no FCM, no Play Billing).

## No store, so the app updates itself

A device with no Play Store cannot be updated the normal way, and sideloading
over a cable is not a product. See
[Over-the-air updates](./over-the-air-updates.md) for both halves: JavaScript
updates through EAS, and an in-app APK updater for everything native.

## Driving one from a laptop

The panel sleeps within a minute and wakes to a lock screen you cannot type
into over adb, which ruins long drills.

```sh
adb shell svc power stayon true          # while plugged in; reset it after
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -n <pkg>/<activity>   # `monkey` did not bring ours forward
adb exec-out screencap -p > shot.png     # verify EVERY step
adb shell input tap X Y                  # device pixels, matches screencap
```

Instrumenting beats guessing. A sideloaded build with `console.log`
breadcrumbs, read back through `adb logcat | grep TAG`, found in one run what
two hours of reading the code had not.
