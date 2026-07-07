---
name: setup-onboarding
description: Scaffold a first-run onboarding flow (from the apps-tooling blueprint) in the current Expo / React Native app. Use when the user wants onboarding, a welcome/intro flow, a first-run experience, or says "set up onboarding". Vendors a config-driven step shell + a first-run gate, and wires the account step to the accounts module. Step CONTENT is app-specific and authored with the user.
---

# setup-onboarding

Vendors the `onboarding` blueprint from **apps-tooling** into the current Expo /
React Native app. It provides the ENGINE (a step shell + a first-run gate); the
screens are app-specific and you build them with the user. The account step ties
into the `accounts` module.

## What this produces in the target app

- `lib/onboarding/OnboardingFlow.tsx` (CORE), the config-driven shell: progress
  dots, a per-step ✕ skip, fade transitions, `onDone`.
- `lib/onboarding/useOnboardingGate.ts` (CORE), the first-run flag + `complete()`.
- `lib/onboarding/steps/AccountStep.tsx` (APP), the account-step wiring example.
- App-authored step components (welcome, value props, taste/choice pickers, a
  preparing/handoff beat) that YOU create with the user.
- Root wiring that renders onboarding once, then the app.

## Steps

Create a todo per step.

1. **Locate the blueprint.** Find `apps-tooling` (usually a sibling). Read
   `modules/onboarding/blueprint.json`.

2. **Copy files** per `blueprint.files` (ownership rule: overwrite `core`, never
   clobber existing `app` files). Ensure `@react-native-async-storage/async-storage`
   is present.

3. **Design the steps with the user.** Onboarding content is product-specific.
   Typical arc: welcome → value props → taste/choice → first content picks →
   account pitch → preparing/handoff. Split any heavy step; keep copy warm and in
   the app's voice. Each step is a component that calls `api.next()` from its
   primary button.

4. **Assemble the steps array** and render the shell (usually a small
   `OnboardingFlow` wrapper component in the app that holds cross-step selection
   state):
   ```tsx
   <OnboardingFlow
     steps={[
       {key: 'welcome', render: api => <WelcomeStep onNext={api.next} />},
       {key: 'value', render: api => <ValueStep onNext={api.next} />},
       // ...app-specific choice/pick steps...
       {key: 'account', skippable: true, render: api => (
         <AccountStep api={api}><YourSignInUI /></AccountStep>
       )},
       {key: 'preparing', render: api => <PreparingStep onComplete={api.next} />},
     ]}
     onStep={(key) => track('Onboarding Step Viewed', {step: key})}
     onSkip={(key) => track('Onboarding Account Skipped')}
     onDone={onDone}
     tint={colors.accent}
     track={colors.separator}
   />
   ```

5. **Tie the account step to the accounts module.** Mark the account step
   `skippable: true` (the shell renders the ✕ that continues without an account).
   Inside it, reuse `useAccounts()` from the `accounts` module, the SAME
   Apple / Google / email-code calls your Profile account section uses. Do not
   write new auth. `AccountStep` advances automatically when `status` becomes
   `signedIn`. Accounts are optional: onboarding must complete either way.

6. **Gate first run in the app root.** Inside your providers (so the account
   step has `useAccounts()` and steps have theme):
   ```tsx
   const {onboarded, complete} = useOnboardingGate('@myapp_onboarded');
   if (onboarded === null) return <Splash/>;
   return onboarded
     ? <AppNavigator/>
     : <OnboardingFlow steps={steps} onDone={() => complete(suppressSameDayCeremony)} />;
   ```
   Pass any completion side effects (e.g. suppressing a same-day launch
   animation) to `complete()`.

7. **Land into value.** The last step (preparing/handoff) should leave the user
   holding something to do, seed a "Your picks"/"Start here" shelf, pre-select
   content, etc. Kick off any downloads in the BACKGROUND; do not make the user
   wait on the preparing screen.

8. **Instrument analytics + verify** per `blueprint.verify`: fresh install shows
   onboarding, completion sets the flag, second launch skips it, the account step
   advances on sign-in and its ✕ skips, Reduce Motion falls back to a fade.

## Notes

- The module is the engine, not the screens. Keep step content app-owned.
- Worked reference: the DailyBook implementation (`components/onboarding/*`,
  `components/StartHereShelf.tsx`, spec `docs/superpowers/specs/2026-07-07-onboarding-flow-design.md`).
- Re-running re-syncs core files; `steps/AccountStep.tsx` is app-owned.
