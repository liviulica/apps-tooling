---
name: setup-crash-reporting
description: Add crash reporting (Firebase Crashlytics via react-native-firebase, from the apps-tooling blueprint) to the current Expo / React Native bare-workflow app, shipped dark until the Firebase config files exist. Use when the user wants crash reporting, Crashlytics, or "know when the app crashes".
---

# setup-crash-reporting

Vendors the `crash-reporting` blueprint into the current app. **Read
`README.md` in this module first** — the lazy-require rule, the consent rule,
and the iOS static-libraries choice (against the rnfirebase docs) are the
substance; the steps below only sequence them.

## Steps

Create a todo per step and work through them in order.

1. **Owner decisions (ask, don't assume):** default on with an opt-out switch,
   or opt-in? Where does the switch live? (DailyBook: Privacy section, default
   on, opt-out, separate from analytics, preserved across settings resets.)
2. `npm install @react-native-firebase/app @react-native-firebase/crashlytics`
   (pin both to the same version).
3. Copy `template/firebase.json` to the app root and
   `template/lib/crash/` into the app; adapt the doc comments' app-specific
   references.
4. **iOS Podfile:** before the target block add
   `$RNFirebaseDisableSPM = true`; inside the target add
   `:modular_headers => true` pods per the README list. Then
   `pod install --repo-update`. If pod install aborts about SPM/frameworks,
   re-read the README — do NOT reach for `use_frameworks!` on a
   static-library project without the owner understanding the risk.
5. **AppDelegate:** `import FirebaseCore` and a GUARDED configure — only when
   `GoogleService-Info.plist` resolves in the bundle
   (`FirebaseApp.configure()` hard-crashes without one).
6. **Xcode phases:** adapt `template/native/add_ios_build_phases.rb` (target
   name, app dir) and run it. It adds the guarded plist-copy and
   dSYM-upload phases.
7. **Android:** classpaths `com.google.gms:google-services` and
   `com.google.firebase:firebase-crashlytics-gradle` in the root
   build.gradle; at the bottom of `app/build.gradle` apply BOTH plugins
   inside `if (file('google-services.json').exists())`.
8. Wire consent: after the app's settings hydrate, call
   `setCrashReportingEnabled(!optOut)`; re-apply on every switch change; make
   sure any "reset settings" path preserves the opt-out.
9. Hook the app's ErrorBoundary: `recordError(err, 'ErrorBoundary')` in
   `componentDidCatch`. Add a dev-only "Test crash" row behind a confirm
   alert.
10. **Prove ship-dark:** full iOS simulator build AND `gradlew assembleDebug`
    with NO config files present. Both must be green. Port DailyBook's
    `crashReporting` + `crashReportingNoModule` test suites.
11. Tell the owner the exact console steps: create the Firebase project, add
    an iOS app (bundle id) and an Android app (package name), download the
    two config files, and where to drop them (`ios/<App>/GoogleService-Info.plist`,
    `android/app/google-services.json`). Native module → rebuild after.
12. Record the decision (deprecation clock included) in the app's decision
    records, and update its store-review/privacy notes: a new third party now
    receives crash data.
