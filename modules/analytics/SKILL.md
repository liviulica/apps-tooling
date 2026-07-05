---
name: setup-analytics
description: Add product analytics (Amplitude, via the apps-tooling blueprint) to the current Expo / React Native app. Use when the user wants to add analytics, tracking, or Amplitude to an Expo/RN app, or says "set up analytics". Vendors a small app-owned wrapper, installs the SDK, wires the root component, and prompts for the API key. Product analytics only — not crash reporting.
---

# setup-analytics

Vendors the `analytics` blueprint from the **apps-tooling** repo into the current Expo / React Native app (Route B: the app owns a copy of the wrapper). Product analytics only. The provider is Amplitude, hidden behind a thin wrapper so app code never imports Amplitude directly.

## What this produces in the target app

- `lib/analytics/` — the wrapper (`config.ts`, `client.ts`, `provider.tsx`, `index.ts` are CORE; `events.ts` is APP-OWNED).
- `@amplitude/analytics-react-native` installed (peer dep `@react-native-async-storage/async-storage`).
- `<AnalyticsProvider>` wrapping the app's root component.
- `EXPO_PUBLIC_AMPLITUDE_KEY` in `.env`.
- Governance: a PR template + a soft "analytics reminder" GitHub Action (`.github/`), and the authoring rule appended to the app's `CLAUDE.md` / `AGENTS.md`.

## Steps

Create a todo per step and work through them in order.

1. **Locate the blueprint.** Find the `apps-tooling` repo (it is usually a sibling of the app under the same parent directory; otherwise ask the user for its path). Read `modules/analytics/blueprint.json` — it is the source of truth for files, deps, env, and wiring. Everything below is driven by it.

2. **Confirm the app is compatible.** It must be Expo / React Native and NOT pure Expo Go (Amplitude needs a dev/standalone build). Detect the entry point from `blueprint.wiring.wrapRoot.entryCandidates` (first one that exists wins — `app/_layout.tsx` for expo-router, else `App.tsx`).

3. **Copy the files** listed in `blueprint.files` from `modules/analytics/<from>` to `<app>/<to>`. **Ownership rule:** overwrite files marked `core`; for files marked `app` (i.e. `events.ts`), only copy if the destination does NOT already exist — never clobber an app's event taxonomy on re-sync.

4. **Add the npm override FIRST, then install.** Apply `blueprint.install.npmOverrides` to the app's `package.json` `overrides` field BEFORE installing. This is critical: Amplitude depends on async-storage `^1.x`, so on an app using async-storage 2.x, npm otherwise installs a duplicate native module that breaks the build. Then run `npx expo install <each blueprint.install.expo>` and ensure each `blueprint.install.peer` is present. Verify a single async-storage with `npm ls @react-native-async-storage/async-storage` (one version, "deduped"). If a duplicate appears (Amplitude was installed before the override), follow `blueprint.install.notes` to clear the stale nested lock entry and re-install. If iOS native dirs exist and `blueprint.install.ios.podInstall` is true, run `cd ios && pod install` (or tell the user to, if pods are slow/unavailable here).

5. **Wire the root.** Wrap the entry point's returned root element in `<AnalyticsProvider>` (from `blueprint.wiring.wrapRoot.importFrom`), placed as the outermost provider (just inside any ErrorBoundary). Add the import. Make this idempotent: if `<AnalyticsProvider>` is already present, skip.

6. **Set up the env vars** (both in `blueprint.env`). Add them to `.env` (create it if needed; ensure `.env` is gitignored): prompt for `EXPO_PUBLIC_AMPLITUDE_KEY` (the wrapper no-ops safely if blank), and **ask whether the Amplitude project is US or EU** and set `EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE` to match — getting the region wrong silently drops every event, so don't skip it. For cloud builds, also set both as **EAS environment variables** (`eas env:create --environment production --name … --value …`), because `.env` is gitignored and is not uploaded to EAS.

7. **Install governance.** The `.github/` files in `blueprint.files` (PR template + the soft analytics-reminder workflow) are copied by step 3. Then **append** `blueprint.governance.agentInstructions.appendFrom` (`analytics-authoring-rule.md`) to the app's `CLAUDE.md` (or `AGENTS.md` if that's what the app uses; create `CLAUDE.md` if neither exists). It is fenced with `BEGIN/END analytics-authoring-rule` markers — replace the block in place on re-sync, never duplicate it.

8. **Events follow the guidelines, not this skill.** Do NOT instrument the app's screens here. The `events.ts` stub + automatic lifecycle events are the starting point; the app owner adds events per `event-guidelines.md` (Object + Past-tense Verb, Title Case; snake_case props; no PII). Optionally add 1–2 example `track()` calls if asked.

9. **Verify.** Typecheck (`npx tsc --noEmit`) to confirm the wrapper compiles. Then walk the user through `blueprint.verify`: set the key, run a dev build, and confirm `App Opened` lands in Amplitude.

## Notes

- This is **product analytics only**. Crash reporting is a separate blueprint.
- Re-running the skill on an app that already has it = a re-sync: core files update, `events.ts` is preserved.
- To swap analytics providers later, only `lib/analytics/client.ts` and `config.ts` change in the blueprint; app code and event names are untouched.
