# crash-reporting (Firebase Crashlytics)

Native + JS crash reporting behind a thin app-owned wrapper, shipped DARK:
without the Firebase config files the app builds and runs identically, and
every wrapper call is a silent no-op. First built for DailyBook (2026-08-01);
the integration reasoning lives in its `docs/decisions/crash-reporting.md`.

## The three rules that matter more than the steps

1. **The wrapper requires the SDK lazily** (`require` in a try/catch, cached).
   `@react-native-firebase/*` resolves its native half at import time, so a
   static import CRASHES AT APP START on every binary built before the module
   existed — which is every existing install the day you ship this. The
   reporter must never be the thing that crashes the app.
2. **Nothing is collected until the user's setting says so.** `firebase.json`
   ships every auto-collection flag off; the app enables Crashlytics at
   runtime from its own privacy switch after settings hydration. The SDK
   persists the flag natively, covering the next launch's early window. Keep
   crash reports a SEPARATE switch from analytics: different questions,
   different consent.
3. **Ship-dark natives.** iOS configures Firebase only when the plist is in
   the bundle (guarded `FirebaseApp.configure`), the plist is copied by a
   guarded build phase, and Android applies the google-services/crashlytics
   gradle plugins only when `google-services.json` exists. Builds never fail
   on a missing config; setup is "drop two files and rebuild".

## iOS integration choice (read before obeying the rnfirebase docs)

The rnfirebase docs demand `use_frameworks! :linkage => :static`. On a
static-library project (most bare RN apps with patched Podfiles or custom
native modules), that global flip is the riskiest change in the whole task.
The alternative that works: `$RNFirebaseDisableSPM = true` (v26+ resolves
Firebase via SPM by default, whose products are dynamic-only) plus targeted
`:modular_headers => true` for the Firebase pods:
FirebaseCore, FirebaseCoreInternal, FirebaseCoreExtension,
FirebaseInstallations, FirebaseSessions, FirebaseRemoteConfigInterop,
GoogleDataTransport, nanopb (GoogleUtilities and the Promises pods too if the
app doesn't already have them).

**Deprecation clock:** Firebase's CocoaPods distribution publishes no new
versions after October 2026 (existing versions keep working). This path pins
Firebase to the last CocoaPods release; a future upgrade means rnfirebase's
SPM/dynamic path and a real device regression pass. Defer knowingly.

## Install into an app

Use the `setup-crash-reporting` skill ([SKILL.md](./SKILL.md)). Summary:
`npm i @react-native-firebase/app @react-native-firebase/crashlytics`, copy
`template/` (wrapper + firebase.json), Podfile lines + `pod install
--repo-update`, guarded AppDelegate configure, the two Xcode build phases
(`template/native/add_ios_build_phases.rb`), conditional gradle wiring, the
privacy switch, an ErrorBoundary `recordError` hook, a dev "Test crash" row,
and prove BOTH platforms build with no config files present. Native module:
dev clients and store builds need a rebuild.

## Files

| File | Purpose |
|---|---|
| `template/lib/crash/index.ts` | The wrapper: lazy SDK, setEnabled, recordError, breadcrumb, testCrash |
| `template/firebase.json` | Auto-collection OFF; JS exception handler on, chaining on |
| `template/native/add_ios_build_phases.rb` | Adds the guarded plist-copy + dSYM-upload phases (adjust target/app name) |

App-owned after vendoring; the consent wiring and switch copy follow each
app's own settings system.
