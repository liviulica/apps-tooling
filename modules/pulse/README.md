# pulse

One command that pulls what is happening with a shipped app into a dated
snapshot, renders a report, and lets an agent narrate it against the previous
run.

```
/pulse                       # every source, last 7 days
/pulse revenue,crashes       # only those
/pulse --since 30d --dashboard
node scripts/monitoring/pulse.js ...   # the same thing without an agent
```

Five sources, all optional:

| Source | What it answers | Needs |
|---|---|---|
| Crashlytics | crash-free rate, top issues, sample stacks | `firebase login` (via the Firebase MCP server) |
| App Store Connect | written reviews, star ratings, sales units, store version, builds | an ASC API key; ratings need nothing |
| Amplitude | activation and paywall funnels, engagement, failures | project API key + secret key |
| RevenueCat | active subscriptions, trials, MRR, revenue | a secret key with `charts_metrics:overview:read` |
| Supabase | accounts, synced rows, in-app feedback, edge function errors | the logged-in Supabase CLI |

## Why this exists

An app's signals live in five consoles that nobody opens on a schedule.
Nothing correlates them and nothing keeps history, so a regression in any one
of them is invisible until someone happens to look. The value is not the
fetching, it is having all five in one artifact: the contradictions only show
up side by side. The first real run on DailyBook found the app reporting a
completed purchase while RevenueCat showed no subscription at all.

## The rule

**A source that could not answer is not a source that answered zero.**

Three states, never two: `ok`, `missing` (it answered, there is nothing),
`unavailable` (no credential, 4xx, 5xx, timeout). An `unavailable` block
prints its reason and no measurement of any kind, its deltas are suppressed,
and every blind spot is listed again at the end of the report.

"0 crashes" and "could not reach Crashlytics" look identical in a naive
implementation, and the first one reads as good news. Everything else in this
module is negotiable; that is not.

## Shape

```
scripts/monitoring/
  pulse.js         entry: args, orchestration, snapshot read/write
  config.js        the three-state contract, env loading, window, reason summary
  app-config.js    APP-OWNED: the app's ids and storefronts
  events.js        APP-OWNED: the event names the analytics queries use
  metrics.js       pure: deltas, conversion, tallies, crash-free rate
  render.js        snapshot -> markdown
  dashboard.js     snapshot -> one self-contained HTML page
  sources/         one module per source, all obeying the same contract
monitoring/
  snapshots/YYYY-MM-DD.json   raw + computed. gitignored.
  reports/YYYY-MM-DD.md       the narrative. committed.
```

Sources return `{status, data?, reason?}` and nothing else. Adding a sixth is
a module in `sources/`, an id in `SOURCES`, a door in the command, and a
section in the setup doc; a test enforces the last two.

## Crashlytics is fetched by the agent, not the script

There is no public REST read API for Crashlytics. The supported programmatic
path is the Firebase MCP server (`npx firebase-tools mcp --only crashlytics`),
so `/pulse` calls `crashlytics_get_report` itself and hands the result to the
script with `--crashes-from <file.json>`. The handoff is a plain JSON file in
a fixed shape, so the block stays inspectable and testable instead of being
something a model narrates from memory.

The alternative is the BigQuery export, which needs the Blaze plan and
`gcloud`/`bq` locally. The snapshot schema is the same either way, so
switching later changes one module and no reports.

## Secrets

`.env.monitoring.local`, never the app's `.env`. In an Expo/EAS app the client
`.env` is deliberately uploaded to the build servers so public keys reach the
bundle, so a server secret placed there ships to the build infrastructure.
`.env.*.local` is excluded by both git and `.easignore`.

## Testing

Ten suites, no network: the boundaries (HTTP, the Supabase CLI) are injected,
never the code under test. The invariant worth proving is mutation-checked:
make the renderer print a number for an unavailable source and a named test
must die.

That check earned its keep during development. The first version of the
unavailable test passed even with the per-section message deleted, because it
was matching the report's footer instead of the section. A mutation that
survives is a test that is not testing.

## Extending

- **A new source:** copy the shape of `sources/revenuecat.js`. Take
  `{env, window, fetchImpl}`, return the three-state result, and never let a
  failure escape as an exception.
- **A new metric:** put it in `metrics.js` as a pure function that returns
  `null` when the input cannot support an answer. Callers decide how to print
  null; the function never guesses.
- **Thresholds and alerting:** deliberately absent. Until an app has traffic,
  any "crash-free below X" rule is a guess, and a false alarm on the first run
  teaches the owner to ignore the tool. Add them when the numbers can
  calibrate them.
- **Scheduling:** the script is a plain Node entry point, so a cron job or a
  CI workflow can run it. Only do that once the report has proved useful by
  hand; a digest nobody reads is worse than no digest.
