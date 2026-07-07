# onboarding

A first-run onboarding **engine** for Expo/RN apps: a config-driven step shell
and a first-run gate. It deliberately does NOT ship screens, onboarding content
is product-specific, so the module gives you the reusable mechanics and leaves
the steps to the app. The account step ties into the [accounts](../accounts)
module.

Worked reference: the DailyBook implementation (`components/onboarding/*`,
`components/StartHereShelf.tsx`, and the design spec at
`daily-book/docs/superpowers/specs/2026-07-07-onboarding-flow-design.md`).

## What you get

- **`OnboardingFlow`**, pass an ordered `steps` array; the shell renders the
  progress dots, a per-step ✕ skip, the fade between steps, and fires `onDone`
  after the last step. `onStep` / `onSkip` are analytics hooks. `tint` / `track`
  colors theme it.
- **`useOnboardingGate`**, reads a first-run flag and gives you `complete()`;
  the app root renders `<OnboardingFlow>` once, then the app. Fail-open on a
  storage error so a user is never trapped.
- **`steps/AccountStep`**, the wiring that reuses the accounts module's
  `useAccounts()` and advances on sign-in.

## The pattern

1. Author your step components in the app (welcome → value props → taste/choice
   → content picks → account → preparing/handoff). Each calls `api.next()`.
2. Assemble them into a `steps` array and render `<OnboardingFlow>`; keep any
   cross-step selection state in a small app wrapper around it.
3. Gate first run in the app root with `useOnboardingGate`, inside your providers
   so steps have theme and the account step has `useAccounts()`.
4. Land into value: seed a starter shelf / pre-select content; download in the
   background, never make the user wait on the preparing screen.

## Tying onboarding to account creation

The account step is where onboarding meets the [accounts](../accounts) module,
and the rule is **reuse, do not reinvent**:

- Mark the account step `{key: 'account', skippable: true, ...}`. The shell then
  renders the ✕ that continues WITHOUT an account. Accounts are optional;
  onboarding must complete either way.
- Inside the step, render your app's own styled sign-in UI calling the SAME
  `useAccounts()` methods your Profile account section uses (Apple / Google /
  email code). No new auth code.
- Wrap it in `AccountStep`, which advances automatically once `status` becomes
  `signedIn`.
- Frame it as benefit ("keep your place across devices"), not a wall. Put it
  LATE (after the user has picked content) so there is something to save.

## Files and ownership

| File | Ownership | Role |
|---|---|---|
| `lib/onboarding/OnboardingFlow.tsx` | core | the step-shell engine |
| `lib/onboarding/useOnboardingGate.ts` | core | first-run flag + complete() |
| `lib/onboarding/steps/AccountStep.tsx` | app | account-step wiring (customize) |

## Install into an app

Run `/setup-onboarding` (symlink the module into `~/.claude/skills/`), or follow
`SKILL.md` + `blueprint.json` by hand. The skill walks designing the steps with
the user, since content is app-specific.
