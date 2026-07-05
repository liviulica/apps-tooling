# accounts

Accounts + cross-device sync for Expo/RN apps, on Supabase, behind a thin
app-owned wrapper. Native Sign in with Apple (iOS), native Google sign-in,
email OTP (passwordless 6-digit code), a local-first namespace sync engine,
share-by-reference tables, true account deletion (App Store 5.1.1(v),
including Apple token revocation per TN3194), and a RevenueCat webhook stub
for the future payments phase.

Design rationale and the verified research behind every choice:
`daily-book/docs/accounts-research.md` (sibling repo).

## Why a wrapper

`client.ts` is the only file importing `@supabase/supabase-js`; app code uses
`useAccounts()` and the typed helpers. Swapping backends later means rewriting
`client.ts`/`config.ts` and the `supabase/` dir; screens and the sync registry
survive.

## Install into an app

Run the skill: symlink this module to `~/.claude/skills/setup-accounts`, then
run `/setup-accounts` in the app. Manual path: follow `blueprint.json` +
SKILL.md by hand.

## Files and ownership

| File | Ownership | Role |
|---|---|---|
| `lib/accounts/config.ts` | core | env (public client values only) |
| `lib/accounts/client.ts` | core | the ONLY supabase-js import; transport + function invoker |
| `lib/accounts/types.ts` | core | shared types |
| `lib/accounts/sync.ts` | core | pure sync engine (tested in this repo) |
| `lib/accounts/signin-*.ts` | core | Apple / Google / email OTP flows |
| `lib/accounts/provider.tsx` | core | `<AccountsProvider>` + `useAccounts()` |
| `lib/accounts/index.ts` | core | barrel |
| `lib/accounts/sync-registry.ts` | app | YOUR namespaces + merge rules |
| `components/accounts/SignInSection.tsx` | app | example UI; restyle or replace |
| `supabase/migrations/*.sql` | core | profiles, user_state, apple_credentials, shares |
| `supabase/functions/*` | core | apple-token-exchange, delete-account, revenuecat-webhook |

## The local-first contract

Local storage stays the source of truth. The engine mirrors registered
namespaces: `syncAll()` on sign-in/foreground (pull, merge, save, push diff),
`queuePush()` debounced after local writes, `flush()` on background/sign-out.
Merge is per-namespace and app-defined; the engine never invents semantics.

## Gotchas (hard-won)

- Google sign-in needs the WEB client id in the env var, not the iOS/Android
  ones, and "Skip Nonce Check" enabled on the Supabase Google provider (the
  free native library cannot pass a custom nonce).
- Apple only returns the user's name on the FIRST authorization ever; the
  wrapper persists it then. To re-test, revoke the app under Settings > Apple
  ID > Sign-In & Security.
- The Apple authorizationCode expires in minutes and is single-use; the
  refresh-token exchange must happen at sign-in time (the wrapper does it,
  best effort).
- `revenuecat-webhook` must be deployed with `--no-verify-jwt`; the other two
  functions keep JWT verification ON.

## Dev harness (this repo)

`npm test` runs the vitest suite for the pure sync engine; `npm run
typecheck` covers `types.ts`/`sync.ts`. RN-dependent template files are
typechecked in the consumer app (blueprint verify step), same as analytics.
