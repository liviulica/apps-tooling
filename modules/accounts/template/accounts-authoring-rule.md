<!-- BEGIN accounts-authoring-rule (managed by apps-tooling/modules/accounts) -->
## Accounts and sync (required when touching user data)

- The account is optional. Every feature must work signed-out; sync mirrors
  local state, it never gates it.
- New local state that should follow the user across devices MUST be
  registered as a namespace in `lib/accounts/sync-registry.ts` with an explicit
  merge rule (max for counters/furthest-progress, union for collections,
  last-write-wins for preferences). After local writes, call
  `queuePush('<namespace>')` from `useAccounts()`.
- Never import `@supabase/supabase-js` outside `lib/accounts/client.ts`.
- Every new user-data table needs: RLS owner policies, `on delete cascade`
  from `auth.users`, and (if it holds personal data) coverage by the
  `delete-account` edge function. Account deletion must stay TRUE deletion
  (App Store guideline 5.1.1(v)).
- Auth analytics events to use (see `lib/analytics/events.ts`):
  `Sign In Started` / `Sign In Completed` / `Sign In Failed` (prop `method`:
  apple|google|email), `Signed Out`, `Account Deleted`, `Sync Completed`.
  Never put emails, tokens, or share note content in analytics properties.
<!-- END accounts-authoring-rule -->
