---
description: Capture a project todo to todos/
argument-hint: "<todo text>"
---

# /todo:add

Capture a project todo to `todos/`. Title = the user's verbatim phrasing. Do not paraphrase.

The todo text is in `$ARGUMENTS`. If empty, infer from the user's prior message; if still ambiguous, ask before creating.

## Procedure

1. Slugify the todo text → `<kebab-slug>` (lowercase, hyphens, drop punctuation, cap at ~8 words).
2. Infer `area` from the text/context (see taxonomy in `todos/CLAUDE.md`); default to `misc`. Don't ask just to set the area.
3. Resolve `author` = the current GitHub handle: run `gh api user -q .login 2>/dev/null || git config user.name`. Use whatever comes back; if both are empty, omit the field rather than guessing.
4. Create `todos/<today>-<slug>.md` (`<today>` = current date `YYYY-MM-DD` from system context) with this frontmatter and minimal body:

   ```yaml
   ---
   title: "<verbatim user phrasing>"
   area: <inferred-area>
   author: <github-handle>
   created: <today>
   ---

   > "<exact text the user provided>"
   ```

5. In your next response, mention the path in one sentence: "Logged as a todo: `todos/<file>.md`."

## Notes

- Empty body beyond the verbatim quote is fine. Don't interpret or expand at capture time.
- Multiple todos in one message → separate files. Never merge.
- Omit `priority` at capture (set it later during review).
- `author` records who captured the todo, for multi-user repos. Resolve it once per capture from `gh` (falling back to git config); never ask the user for it.
- If the title has no antecedent in the conversation, ask the user first.
- If the user asks you to flesh out the idea into something implementable and it grows past a short capture, put the detailed spec in `plans/<slug>.md` and make the todo a short pointer to it (see `todos/CLAUDE.md` § "When a todo outgrows the format").

## Pointer

See `todos/CLAUDE.md` for the full convention (area taxonomy, author, review, completion, graduate-to-plans rule).
