# React Native testing traps (Jest), found the expensive way

Cross-cutting notes for any Expo / RN app using these modules. Each entry cost
real debugging time in a shipped app; none of them is in the Jest or RN docs in
a form you would find before you needed it.

## A failing provider test HANGS instead of failing

**Symptom.** A test file with a deliberately broken assertion produces no
failure output. The run sits there until it is killed. Kill it and Jest reports
nothing useful.

**Mechanism.** Tests that mount real providers usually unmount at the end of the
test body. When an assertion throws, that unmount never runs. If the provider
arms a long timer (a date-rollover check just after local midnight is the classic
one), the leaked tree holds a live handle hours into the future. With no fake
timers and no `forceExit`, Jest waits for it.

**Why it matters more than a slow suite.** The failure a test exists to announce
becomes a hang, and a hang reads as "the test is slow" or "CI is flaky", not "the
code is broken". It hides exactly what it was written to reveal.

**Fix.** Register every mounted tree in the mount helper and tear them all down
in an `afterEach` wired through `setupFilesAfterEnv`, pass or fail. Keep the
explicit `unmount()` in test bodies (make it idempotent): it still documents the
lifecycle under test.

```js
// jest.config.js
setupFilesAfterEnv: ['<rootDir>/__tests__/support/afterEnv.ts'],
```

Load `react-test-renderer` inside the hook only when something was actually
mounted, so suites that never mount pay nothing for the sweep.

## `__DEV__` does not exist under Jest, and ship-dark code eats the error

**Symptom.** A module that works in the app initializes to nothing under test,
with no error printed. Anything guarded by "is this configured" reports
unconfigured.

**Mechanism.** Metro defines `__DEV__` globally; Jest does not. The first line to
evaluate it throws `ReferenceError`. Ship-dark modules are written to treat any
initialization fault as "the feature is unavailable" and swallow it, which is
correct in production and blinding in tests.

**Fix.** Define it in `setupFiles`, false by default so tests see release
behavior unless they opt in:

```js
global.__DEV__ = false;
```

Worth grepping for `__DEV__` in vendored modules before assuming a test failure
is about the code under test.

## `jest.isolateModules` gets a FRESH module mock, so platform helpers miss it

**Symptom.** A `withPlatform('android', ...)`-style helper has no effect on a
module loaded inside `jest.isolateModules` / `isolateModulesAsync`. The code
under test still sees iOS.

**Mechanism.** The helper mutates `Platform.OS` on the mock in the OUTER registry.
An isolated registry re-evaluates `moduleNameMapper` mocks, so the module under
test reads a different `react-native` object entirely.

**Fix.** Set the platform inside the isolate, on the instance the module will
actually resolve:

```ts
await jest.isolateModulesAsync(async () => {
  jest.doMock('some-native-sdk', () => sdkMock);
  (require('react-native') as {Platform: {OS: string}}).Platform.OS = 'android';
  client = require('../lib/some/client');
});
```

## `jest.requireMock` and `require` can be different instances

For a module reached through `moduleNameMapper`, `jest.requireMock('x')` may
hand back a different object than `require('x')`. Providers write to the
`require` instance, so a test that asserts against the `requireMock` one inspects
an empty store and fails with a mystifying diff. Use plain `require` for stateful
mocks (an in-memory AsyncStorage, for example).

## `jest.spyOn` on something already mocked returns the same mock

Spying on a property that is already a `jest.fn()` gives you that same function
back, so "call the real thing, then observe" quietly becomes "observe the mock
observing itself". Two runs deadlocked this way before the cause was clear. When
a test needs ordering guarantees around effects, prefer real structure (React
runs child effects before parent effects) over layered spies.

## Proving a test can fail, when there is no "before"

For logic with no unfixed version to run against — a fresh one-time migration, a
merge rule — mutate the invariant in place and confirm a NAMED test dies for each
mutation, then restore. Four mutations, four distinct deaths, is a much stronger
signal than four green assertions.

Beware of doing this in a shell one-liner that chains mutations: if the runner
hangs mid-chain and the outer command is killed, the restore step may never run
and a mutation gets left in the working tree. Restore from git, verify with
`git diff`, and re-run the suite before trusting the result.
