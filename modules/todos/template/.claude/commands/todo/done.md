---
description: Mark a todo done (git mv to todos/done/)
argument-hint: "<slug or title fragment>"
---

# /todo:done

Mark an open todo as complete by moving it to `todos/done/`.

The match text is in `$ARGUMENTS` (a slug or part of the title). If empty, ask which todo to complete.

## Procedure

1. Find files in `todos/` (excluding `done/`) whose filename or `title` frontmatter matches `$ARGUMENTS` (case-insensitive substring).
2. If exactly one matches, `git mv todos/<file>.md todos/done/<file>.md`.
3. If multiple match, list them and ask which one. If none match, say so and run `/todo:list` to show what's open.
4. Confirm in one line: "Done: `todos/done/<file>.md`."

## Notes

- Don't edit the frontmatter — the folder records completion, not a status field.
- Use `git mv` (the file is tracked), not plain `mv`.
