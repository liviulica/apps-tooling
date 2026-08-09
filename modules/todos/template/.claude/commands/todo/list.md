---
description: Review open todos, grouped by area
argument-hint: "[area | @author]"
---

# /todo:list

List open todos (the project roadmap). Grouped by `area`. Read only the YAML frontmatter — don't read bodies unless asked.

`$ARGUMENTS` is an optional filter: a bare word filters by `area`; a `@handle` filters by `author`. Empty = show everything.

## Procedure

1. Gather `todos/*.md` (skip `todos/CLAUDE.md` and anything under `todos/done/`).
2. For each file, read only the frontmatter and extract `title`, `area`, `author`, `created`, `priority` (if set).
3. Apply the `$ARGUMENTS` filter if present (by `area`, or by `author` when it starts with `@`).
4. Group by `area` (see the order in `todos/CLAUDE.md`; unknown areas last, alphabetically).
5. Within each area, sort by `priority` (high → med → low → unset), then `created` ascending (oldest first).
6. Compute age in days = today − `created`.

## Output

```markdown
## Roadmap — <today> (<N> open)

### <area> (<n>)
- **<title>** — <age>d old<, priority: <priority> if set><, @<author> if set> — `todos/<file>.md`
- ...
```

Omit areas with zero open todos. Show `@<author>` only when the field is present. End with one line: "Say `/todo:done <title>` to complete one, or open a file to flesh it out."

## Pointer

See `todos/CLAUDE.md` for the convention.
