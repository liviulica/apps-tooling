---
description: Pull crashes, reviews, analytics, revenue and backend health, then analyse them
---

# /pulse

Pull every monitoring source into one dated snapshot, render the report, and
say what changed and what to do about it.

Arguments (all optional): a comma-separated source list (`crashes`, `reviews`,
`amplitude`, `revenue`, `supabase`), `--since 30d`, `--dashboard`.

## Procedure

1. **Gather crashes first**, because the script cannot. Crashlytics has no
   public REST read API, so the numbers come from the Firebase MCP server
   registered in `.mcp.json`.

   - Call `crashlytics_get_report` with `report: "topIssues"` for the window,
     and `crashlytics_list_events` for a sample stack on the top two or three
     issues. The `appId` argument is the Firebase app id, not the bundle id.
   - **Also call `crashlytics_get_report` with `report: "topVersions"`.** It
     answers "which versions has Crashlytics ever heard from", which does not
     depend on anything crashing. Empty topIssues plus empty topVersions means
     Crashlytics has never received a single report, which is a broken
     pipeline, not a healthy app. Reporting that as "no crashes" is the worst
     lie this tool could tell.
   - Write the result to a temp file as JSON in this exact shape, then pass
     its path in step 2:

     ```json
     {
       "crashFreeRate": 0.994,
       "totalEvents": 6,
       "topIssues": [
         {"title": "RangeError: invalid array length", "events": 4, "users": 3,
          "version": "1.5.0", "sample": "first frames of the stack"}
       ]
     }
     ```

   - If the MCP server is not connected or `firebase login` has never run, do
     NOT write the file. Skip to step 2 without `--crashes-from`, so the run
     reports crashes as unavailable rather than as zero. Say so in the report.
   - `topIssues: []` is the right file when Crashlytics answered and there
     were genuinely no crashes. That is a different thing from not looking.

2. **Run the script.**

   ```bash
   node scripts/monitoring/pulse.js [sources] [--since 7d] [--crashes-from <file>] [--dashboard]
   ```

   It writes `monitoring/snapshots/<date>.json` (gitignored, holds raw
   payloads) and `monitoring/reports/<date>.md` (committed, holds counts), and
   prints the report.

3. **Read both snapshots.** The current one and the previous one named in
   `previousDate`. The script computes the deltas it can; you are looking for
   the ones it cannot: a crash signature that first appeared this week, a
   funnel step that moved, feedback that repeats a complaint the store reviews
   also mention.

4. **Cross-check the sources against each other.** The value of one command
   over five consoles is catching what no single console can see: the app
   reporting a completed purchase while the billing provider shows no
   subscription, an event count that contradicts a backend row count, a crash
   spike that lines up with a release date. Name any contradiction plainly.

5. **Quote the reader text.** Review bodies and in-app feedback notes live in
   the snapshot, never in the committed report. If there is feedback, quote it
   in your reply. It is usually the review ask's unhappy path, so it is the
   most direct signal in the whole run and nobody else will ever read it.

6. **Say what is blind.** Every source that came back `unavailable` is listed
   at the end of the report. Repeat that in your reply and never let a
   half-blind run read as an all-clear. If the reason names a missing
   credential, point at the exact section of `docs/monitoring-setup.md`.

## Output

Lead with one paragraph: is the app healthy, is anyone using it, is it
converting. Then the three or four things that changed and what each one
implies. Then a short list of what to do, ordered by what a crash or a
complaint says is actually hurting users.

Never invent a number that is not in the snapshot. If a source could not be
reached, the honest report says so.
