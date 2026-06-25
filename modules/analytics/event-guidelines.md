# Event tracking guidelines

The rules for naming and structuring analytics events across our apps. This is
the **single source of truth** — read it before adding any event. Based on
Amplitude's taxonomy guidance and common product-analytics conventions.

Goal: a taxonomy that is consistent, lean, privacy-safe, and survives UI changes,
so the data is actually usable for funnels, retention, and behavioural analysis.

## The three building blocks

| Block | What it is | Example | Set via |
|---|---|---|---|
| **Event** | A meaningful action a user took | `Book Opened` | `track('Book Opened', {...})` |
| **Event property** | Context about *that instance* of the event | `source: 'gutenberg'` | the props arg of `track` |
| **User property** | A trait of the *user*, persists across all future events | `library_size: 12` | `setUserProperties({...})` |

Rule of thumb: if it describes *the action*, it's an event property; if it
describes *the person* and stays true between events, it's a user property.

## Naming: events

- **Object + Past-tense Verb, in Title Case.** `Book Opened`, `Search Completed`,
  `Audiobook Played`. The object is the noun, the action is what happened to it.
- **Past tense always** — an event is a record of something that already happened.
- **Title Case, consistently.** Amplitude treats `Book Opened` and `book opened`
  as *two different events*, so casing must never drift.
- **Fixed strings only.** Never build event names dynamically. Variable data
  (ids, types, counts) goes in **properties**, never in the name. Bad:
  `Book 123 Opened`. Good: `Book Opened` + `{ book_id: '123' }`.
- **From the user's perspective**, not the UI's. `Search Completed`, not
  `Search Results Component Rendered`.

| Bad | Good | Why |
|---|---|---|
| `bookOpen` / `book_opened` | `Book Opened` | Title Case, past tense |
| `Clicked Play Button` | `Audiobook Played` | action, not a UI click |
| `Opened Book 42` | `Book Opened` + `{book_id}` | no variable data in the name |
| `Gutenberg Book Opened`, `Imported Book Opened` | `Book Opened` + `{source}` | consolidate; don't fork events |

## Naming: properties

- **snake_case**, always. The different casing from events (Title Case) makes the
  two visually distinct in the Amplitude UI.
- **Descriptive, not generic.** `book_id`, `file_type` — not `id`, `type`.
- **Conventions:**
  - identifiers → `*_id` (`book_id`)
  - booleans → `is_*` / `has_*` (`is_offline`)
  - durations → **seconds**, suffixed `_seconds` (`duration_seconds`)
  - counts → `*_count` (`results_count`)
  - enums → a small set of lowercase snake_case strings, documented with the event

## What to track (and what not to)

- **Track meaningful actions tied to a question you want answered** (activation,
  engagement, retention), not every tap or screen render.
- **Consolidate similar actions into one event + a distinguishing property.**
  One `Book Opened` with `{ source: 'gutenberg' | 'librivox' | 'imported' }`,
  not three separate events. (Amplitude's canonical example: one `Order Completed`
  with a `payment_method` property, not one event per payment type.)
- **Keep it lean:** aim for **≤ 20 properties per event** (Amplitude's guidance),
  and don't add an event you have no question for yet.

## Privacy / PII — non-negotiable

Never put PII or free text in event names or properties:
- ❌ names, emails, user-typed text, **raw search queries**, book/passage content,
  absolute file paths, precise location.
- ✅ ids, counts, lengths, durations, enums, booleans.

Examples: track `Search Completed` with `{ query_length, results_count }` — never
the query string. Track `Dictionary Looked Up` with a count — never the word.
Analytics is anonymous and device-scoped; we set no name/email user property.

## Default / automatic properties

Amplitude auto-captures platform, app version, OS, device, and session info — do
not re-track these. Add app-level defaults (e.g. an experiment bucket) only if you
have a question for them.

## Base events (provided by the wrapper — do not redefine)

The shared wrapper already emits these; keep them in the `AnalyticsEvent` union:
- `App Opened`, `App Foregrounded`, `App Backgrounded` (from `<AnalyticsProvider>`)
- `Screen Viewed` (from `analytics.screen(name)`), with `{ screen }`

## How to add an event

1. Confirm it's a **meaningful action**, not a raw click/view.
2. Check no existing event covers it — if close, **consolidate** with a property.
3. Name it **Object + Past-tense Verb, Title Case**.
4. Add it to the `AnalyticsEvent` union in `events.ts` (it's typed — unknown names
   fail to compile).
5. Define its properties: snake_case, documented, **no PII**, ≤ 20.
6. Call `track('Name', { ...props })` at the action's boundary.

### Checklist
- [ ] Object + Past-tense Verb, Title Case
- [ ] Fixed string — no ids/values baked into the name
- [ ] A real user action, not a UI click/render
- [ ] Not a duplicate — consolidated with a property where possible
- [ ] Properties snake_case, ≤ 20, zero PII / free text
- [ ] Added to the `AnalyticsEvent` union

## Repo policy: instrument as you build

Analytics is part of a feature, not a follow-up. **Every PR that adds or changes
user-facing behaviour must add or update the relevant events** (`events.ts` + the
`track()` call sites), following the rules above.

Exempt (no events expected): pure refactors, bug fixes with no new user action,
styling, copy, tests, docs, build/CI/config.

Three safeguards ship with this module so the policy is followed, not just stated:
- **Agent authoring rule** (`analytics-authoring-rule.md`, appended to the app's
  `CLAUDE.md` / `AGENTS.md`): AI-assisted work instruments events at authoring time.
- **PR checklist** (`.github/pull_request_template.md`): the author ticks "added
  events" or "not applicable."
- **Soft CI reminder** (`.github/workflows/analytics-check.yml`): on each PR, if
  feature code changed but no analytics did, it posts a reminder comment. It is a
  *nudge, not a gate* — a machine can't know which events a feature needs, so it
  never blocks. Human review + the checklist are the real enforcement.

## Worked example: a reading app (DailyBook)

This is how the rules apply in practice (and the spec for instrumenting DailyBook).

**Events + properties**

| Event | Properties | Fires when |
|---|---|---|
| `Book Opened` | `book_id`, `source` (gutenberg \| librivox \| imported), `format` (text \| audio) | a book/reader is opened |
| `Reading Session Completed` | `book_id`, `duration_seconds`, `pages_turned` | leaving the reader |
| `Book Finished` | `book_id`, `source` | last page / end reached |
| `Search Completed` | `query_length`, `results_count` | a search returns |
| `Book Imported` | `source`, `file_type` | a device file is imported |
| `Audiobook Played` | `book_id`, `duration_seconds` | playback starts/segment ends |
| `Dictionary Looked Up` | `lookup_count` | a definition is requested |
| `Setting Changed` | `setting` (theme \| font_size \| …), `value` | a setting is updated |

**User properties** (set via `setUserProperties`): `library_size`,
`preferred_theme`, `font_size`, `preferred_source`. No name/email.

## Sources

- Amplitude — Plan your taxonomy / Data Planning Playbook: https://amplitude.com/docs/data/data-planning-playbook
- Amplitude — What Are the Components of Event Data: https://amplitude.com/blog/event-data-components
- Amplitude — Best practices for analytics tracking: https://amplitude.com/blog/analytics-tracking-practices
- Segment — Naming conventions for clean data: https://segment.com/academy/collecting-data/naming-conventions-for-clean-data/
