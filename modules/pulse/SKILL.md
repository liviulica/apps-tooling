---
name: setup-pulse
description: Add the monitoring pulse (from the apps-tooling blueprint) to the current project — one command that pulls crashes, store reviews and ratings, product analytics, revenue and backend health into a dated snapshot and analyses it. Use when the user wants monitoring, an app health report, a weekly digest of how the app is doing, or says "pull my Crashlytics/reviews/Amplitude/RevenueCat data", "I want one place to see what's happening with the app", "set up pulse", or "add monitoring like daily-book has".
---

# setup-pulse

Vendors the `pulse` blueprint from the **apps-tooling** repo into the current
project (Route B: the project owns the copy). It adds one command that pulls
every monitoring source into a dated snapshot, renders a report, and lets you
narrate what changed.

Five sources ship: Crashlytics, App Store Connect, Amplitude, RevenueCat,
Supabase. All optional. An app missing four of them still gets a working
command that reports the fifth and says plainly that it could not see the
rest.

## The one idea this module exists to protect

**A source that could not answer is not a source that answered zero.**

Every source resolves to exactly one of three states:

- `ok` — it answered and there is data.
- `missing` — it answered and there is genuinely nothing (no crashes, no
  reviews, no purchases).
- `unavailable` — no credential, 4xx, 5xx, network failure, timeout.

An `unavailable` block prints its reason and **no measurement of any kind**,
its deltas are suppressed, and every blind spot is repeated at the end of the
report so a half-blind run cannot be skimmed as an all-clear.

Collapsing `missing` and `unavailable` is how a monitoring tool lies: "0
crashes" and "could not reach Crashlytics" look identical in a naive
implementation, and the first one reads as good news. If you change one thing
in this module, do not change that.

## What this produces in the target project

- `scripts/monitoring/` — the engine (CORE) plus `app-config.js` and
  `events.js` (APP-OWNED).
- `.claude/commands/pulse.md` — the `/pulse` command.
- `.mcp.json` — the Firebase MCP server, scoped to Crashlytics.
- `docs/monitoring-setup.md` — the click path for every credential (APP-OWNED).
- `__tests__/monitoring*.test.ts` — ten suites, no network.
- `monitoring/snapshots/` (gitignored) and `monitoring/reports/` (committed).

## Steps

Create a todo per step and work through them in order.

1. **Locate the blueprint.** Find the `apps-tooling` repo (usually a sibling
   of the project). Read `modules/pulse/blueprint.json` — it is the source of
   truth for files and ownership.

2. **Check the runtime.** `node -v` must be 18 or newer (global `fetch`).
   This module is **CommonJS `.js` on purpose**, because a ts-jest/CommonJS
   suite cannot `require` an ESM module and the tests would be unrunnable. A
   host app declaring `"type": "module"` would otherwise make every file here
   an ES module and break `require` at load, so the blueprint ships a scoped
   `scripts/monitoring/package.json` containing `{"type": "commonjs"}`. Copy
   it; do not drop it as noise. If the project's Jest runs in ESM mode, say so
   before proceeding rather than shipping tests that cannot run.

3. **Copy the files** listed in `blueprint.files`. Overwrite `core` files; for
   `app` files (`app-config.js`, `events.js`, `docs/monitoring-setup.md`,
   `monitoringAmplitude.test.ts`) write only if the destination does not
   already exist. Never clobber a project's own identifiers or event list on
   re-sync.

4. **Fill in `app-config.js`.** Find the values in the project rather than
   asking: the App Store id in `eas.json` (`ascAppId`) or the store URL, the
   bundle id in `app.json` / `Info.plist` / `build.gradle`, the Firebase
   project in `GoogleService-Info.plist` (`PROJECT_ID`), the Supabase ref in
   `.env` (`EXPO_PUBLIC_SUPABASE_URL`). Ask only for what you genuinely cannot
   find. Leave a blank rather than guessing: a blank makes one source
   `unavailable` with a clear reason, and a wrong id produces a confusing 404.

5. **Fill in `events.js` from the project's real taxonomy.** Read the app's
   event list (with the analytics module, `lib/analytics/events.ts`) and pick:
   an activation funnel, the monetization funnel, the events that mean the app
   is being used, and the failures that should be rare. Use names that exist,
   verbatim. Then point the drift guard in `monitoringAmplitude.test.ts` at
   the taxonomy file. If the taxonomy is a TypeScript union, the guard parses
   it out of the source, because a type union has no runtime members to
   import.

6. **Wire the ignore rules** from `blueprint.wiring`: `monitoring/snapshots/`
   and `monitoring/reports/*.html` in `.gitignore`, `monitoring/` in
   `.easignore` if the project has one, and the `pulse` package script.

   Then **verify the credential file is ignored on both axes**:
   `git check-ignore -v .env.monitoring.local`, and confirm `.easignore` does
   not upload it. In an Expo/EAS app the client `.env` IS deliberately
   uploaded so public keys reach the bundle, so a secret placed there ships to
   the build infrastructure. This is the single most damaging mistake
   available in this module.

7. **Trim the sources the project does not have.** If there is no Supabase, no
   RevenueCat, or no Amplitude, remove that id from `SOURCES` in `config.js`
   and delete its source module and test. Do not leave a source that can only
   ever report `unavailable`: a permanent blind spot in every report trains
   the reader to skip the blind-spot list, which is where the real ones show
   up.

8. **Run the no-credential proof.** `node scripts/monitoring/pulse.js --json
   --no-write` must exit 0 with every source `unavailable` and a reason naming
   its variable. This is the acceptance test for the whole module.

9. **Run the suite**, then break something on purpose: make `render.js` print
   a number for an unavailable source and confirm a named test dies. A test
   that cannot fail is not a test, and this is the invariant worth proving.

10. **Hand back the console work.** Walk the user through
    `docs/monitoring-setup.md`. Each credential is independent, so let them do
    one and see it light up rather than gathering all of them first. Then run
    `/pulse` and narrate the first real report.

## Things that cost a debugging session the first time

Fold these into the module rather than rediscovering them:

- **Crashlytics has no REST read API.** The Firebase MCP server is the
  supported path. Always ask it for `topVersions` as well as `topIssues`:
  `topVersions` does not depend on anything crashing, so both coming back
  empty means Crashlytics has never received a report at all. Reporting that
  as "no crashes" is the worst failure this tool can have.
- **App Store Connect hides most ratings.** `customerReviews` returns only
  reviews with text, and there is no endpoint for the star average or for
  per-territory ratings. Read those from the public
  `itunes.apple.com/lookup?id=<id>&country=<cc>`, which needs no credential
  and works before any setup. It returns `averageUserRating: 0` for an unrated
  app; convert that to null, because zero stars is a damaging claim.
- **The ASC key's ROLE decides what it can read.** A Developer-role key reads
  reviews fine and is refused every sales report with "The API key in use does
  not allow this request", which reads like a bad vendor number. Sales need
  Finance, Sales or Admin.
- **The ASC JWT must be P1363, not DER.** `crypto.createSign(...).sign({key,
  dsaEncoding: 'ieee-p1363'})`. Node's default DER signature is a valid ECDSA
  signature that Apple answers with a flat 401.
- **Amplitude's data region is not a preference.** The wrong host answers with
  HTTP 200 and an empty result set, so every funnel reads zero with no error
  anywhere. Its 403 messages tell the two failures apart: "Invalid API/Secret
  Key combination" means a mismatched key pair, "Invalid API Key" means the
  wrong region.
- **Amplitude answers 400 for an event it has never received.** That is a real
  zero, and a finding: an event in the taxonomy that has never arrived is
  either a code path nobody hits or dead instrumentation. Report it as zero
  and say so, never as a blank.
- **RevenueCat's revenue endpoint takes `start_date` / `end_date` as
  YYYY-MM-DD**, not epoch milliseconds, and its metrics need a secret key with
  `charts_metrics:overview:read`. A 403 there is a permission, not a bad key.
- **Say a shared cause once.** One bad credential fails every block of a
  source; printing the same sentence eleven times in one line buries it.

## Notes

- Re-running the skill is a re-sync: the engine and the tests update;
  `app-config.js`, `events.js` and the setup doc are preserved.
- The command is `/pulse` by default. A project with an existing namespace
  (e.g. `/db:*`) should keep its own convention.
- Snapshots hold raw payloads including review text and feedback bodies, so
  they stay gitignored. The markdown reports hold counts and are committed:
  they are the product's memory, and diffing them across releases is most of
  the value.
- No thresholds ship on purpose. Until an app has traffic, any "crash-free
  below X" rule is a guess, and a false alarm on the first run teaches the
  owner to ignore the tool.
