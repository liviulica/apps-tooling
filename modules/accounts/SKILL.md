---
name: setup-accounts
description: Add accounts + cross-device sync (Supabase, via the apps-tooling blueprint) to the current Expo / React Native app. Use when the user wants accounts, sign-in/login (Apple, Google, email), profile backend, settings/progress sync, or says "set up accounts". Vendors an app-owned wrapper, provisions the Supabase backend (migrations + edge functions), wires the root provider, and walks through the Apple/Google console setup.
---

# setup-accounts

Vendors the `accounts` blueprint from the **apps-tooling** repo into the current
Expo / React Native app (Route B: the app owns a copy). The backend is Supabase,
hidden behind a thin wrapper so app code never imports supabase-js directly.
Native Sign in with Apple (iOS) + native Google + email OTP; local-first
namespace sync; true account deletion (App Store 5.1.1(v)) including Apple
token revocation.

## What this produces in the target app

- `lib/accounts/` wrapper (all CORE except `sync-registry.ts`, which is APP-OWNED).
- `components/accounts/SignInSection.tsx` example UI (APP-OWNED; restyle it).
- `supabase/` migrations + edge functions (CORE), applied to the app's own
  Supabase project.
- `<AccountsProvider>` wired inside `<AnalyticsProvider>`, above data providers.
- Client env in `.env` + EAS; server secrets as Supabase function secrets.
- The accounts authoring rule appended to `CLAUDE.md` / `AGENTS.md`.

## Prerequisites to confirm with the user before starting

1. A Supabase project for THIS app (one project per app). Create at
   database.new if missing; you need the project ref, URL, and anon key.
2. The Supabase CLI (`supabase --version`), logged in and linked
   (`supabase link --project-ref <ref>`).
3. Apple: a Sign in with Apple key (.p8) from developer.apple.com
   (Certificates, Identifiers & Profiles > Keys), the Team ID, Key ID, and the
   app's bundle id with the Sign in with Apple capability on its App ID.
4. Google (optional but recommended): OAuth clients in Google Cloud Console:
   a WEB client (its id goes in the env var) plus iOS/Android clients matching
   the app's bundle id / package name + SHA-1.
5. A dev-build workflow (native modules; Expo Go will not work).

## Steps

Create a todo per step and work through them in order.

1. **Locate the blueprint.** Find `apps-tooling` (usually a sibling of the
   app). Read `modules/accounts/blueprint.json`: it is the source of truth for
   files, deps, env, native config, and backend setup.

2. **Confirm compatibility.** Expo/RN app with dev builds. Detect the entry
   point from `blueprint.wiring.wrapRoot.entryCandidates`. Note whether the
   app is CNG (no git-tracked ios/) or bare (git-tracked ios/): it changes
   step 6.

3. **Copy files** per `blueprint.files`, honoring the ownership rule:
   overwrite `core`, never clobber existing `app` files (`sync-registry.ts`,
   `SignInSection.tsx`).

4. **Install deps.** `npx expo install` each `blueprint.install.expo` entry;
   `npm install` each `blueprint.install.npm` entry. Then verify a single
   async-storage: `npm ls @react-native-async-storage/async-storage` (one
   version; if a duplicate appears, add a package.json override, same pattern
   as the analytics module). If bare iOS: `cd ios && pod install`.

5. **Provision the backend.** The vendored `supabase/` dir arrived in step 3;
   now run `supabase db push` (applies both migrations), then deploy
   functions: `supabase functions deploy apple-token-exchange`,
   `supabase functions deploy delete-account`, and
   `supabase functions deploy revenuecat-webhook --no-verify-jwt`.

6. **Native config** (from `blueprint.native`). CNG: set
   `expo.ios.usesAppleSignIn: true` and `expo.scheme` in app.json, then
   `npx expo prebuild`. Bare: add the Sign in with Apple capability in Xcode
   (creates the .entitlements) and, for share links, a VIEW intent-filter with
   the app's scheme in AndroidManifest.xml. EAS capability sync handles the
   App ID capability at build time.

7. **Dashboard config** (from `blueprint.backend.dashboard`): enable Apple
   (client id = iOS bundle id), Google (WEB client id + Skip Nonce Check),
   and Email providers in the Supabase dashboard. Walk the user through each.

8. **Env + secrets.** Client entries (`scope: client`) go to `.env`
   (gitignored) AND EAS env vars (`eas env:create`). Server entries
   (`scope: server`) are set ONLY via `supabase secrets set` (use each
   entry's `setVia`). Never put a server secret in EXPO_PUBLIC_* or .env.

9. **Wire the root.** Wrap the app inside `<AccountsProvider>` per
   `blueprint.wiring.wrapRoot.placementNote`: directly inside
   `<AnalyticsProvider>`, above the app's data providers. Wire `onAuthEvent`
   to analytics (identify on signed_in, reset on signed_out).

10. **Register sync namespaces.** With the app owner, list which local stores
    should sync, then fill `sync-registry.ts` with load/save/merge per
    namespace and add `queuePush('<ns>')` calls after local writes. Merge
    rules: max for counters/furthest-progress, union for collections, LWW for
    preferences.

11. **Governance.** Append `accounts-authoring-rule.md` to the app's
    `CLAUDE.md`/`AGENTS.md` between the BEGIN/END markers (replace in place on
    re-sync).

12. **Verify** per `blueprint.verify`: tsc, all three sign-in methods on a dev
    build, apple_credentials row present, deletion cascade, and a two-device
    sync round-trip.

## Notes

- Accounts are optional by design: the app must remain fully usable signed
  out. Sync mirrors local state; it never gates features.
- Re-running this skill re-syncs core files; `sync-registry.ts` and the
  example UI are preserved.
- The RevenueCat webhook is a documented stub until the payments phase.
- To swap backends later, rewrite `client.ts` + `config.ts` and the
  `supabase/` dir; app code, the registry, and the provider API are untouched.
