<!-- BEGIN analytics-authoring-rule (managed by apps-tooling/modules/analytics) -->
## Analytics (required when adding features)

When you add or change user-facing behaviour, instrument analytics in the **same**
change — it is part of the feature, not a follow-up:

- Add/extend the typed event union in `lib/analytics/events.ts` and call
  `track('Event Name', { ...props })` at the action's boundary.
- Naming: events are **Object + Past-tense Verb, Title Case** (`Book Opened`);
  properties are **snake_case** (`book_id`). Event names are fixed strings — put
  variable data in properties, never the name.
- **No PII or free text** in names or properties (no raw search queries, no
  content, no emails/paths). Use ids, counts, lengths, durations, enums.
- Consolidate near-duplicate actions into one event + a distinguishing property.
- If a change has no new user action (refactor / bugfix / styling / docs), no
  events are needed — say so in the PR.

Full rules: `apps-tooling/modules/analytics/event-guidelines.md`.
<!-- END analytics-authoring-rule -->
