# CLAUDE.md — todos

## What this folder is

`todos/` is the project's **roadmap and capture surface** for future work and ideas. It holds short, scannable action items that aren't yet active work. It is committed to the repo (so the roadmap travels with the project) but lives **outside the app's import graph**, so it never ends up in a build bundle or the shipped binary — same as `plans/`.

One file per todo. Filenames are the index; there is no registry.

```
todos/
├── CLAUDE.md                       ← this file
├── YYYY-MM-DD-kebab-slug.md        ← open todos
└── done/                           ← completed todos (git mv here)
    └── YYYY-MM-DD-kebab-slug.md
```

`ls todos/` shows only live work. Completed items are out of sight in `done/`.

## Frontmatter schema (light)

```yaml
---
title: "Short, verbatim from the user's phrasing"
area: feature           # see taxonomy below
author: octocat         # GitHub handle of whoever captured it
priority: med           # low | med | high — optional, omit at capture
created: 2026-06-07
---
```

Required at capture: `title`, `area`, `author`, `created`. `priority` is optional and set later, not at capture time. **Status is the folder**: a file in `todos/` is open; a file in `todos/done/` is done. There is no `status` field to maintain.

The body is optional — an empty body (or a single verbatim quote) is a valid todo. Add context, links, or a checklist only when the idea is being fleshed out.

## Author (multi-user)

`author` records who captured the todo — useful when more than one person works the repo. It's resolved automatically at capture from the current GitHub identity (`gh api user -q .login`, falling back to `git config user.name`); never ask the user for it. `/todo:list @handle` filters the roadmap to one person.

## Area taxonomy

Free-form is allowed, but prefer one of these so `/todo:list` groups cleanly. **Edit this list to fit the project** — this file is app-owned and yours to customize; the starter set is deliberately generic:

- `feature` — new user-facing capability
- `bug` — something broken to fix
- `infra` — tooling, tests, CI, scripts, build, project plumbing
- `ux` — cross-cutting polish: design, motion, accessibility, onboarding
- `content` — data, copy, assets the app ships
- `docs` — documentation
- `misc` — anything that doesn't fit

`/todo:list` groups in the order above, then any other areas alphabetically. When you customize the taxonomy, keep the order you want reflected here.

## The "add a todo" convention

When the user says **"add a todo: X"** (or "remember to X", "we should do X", "future idea: X"), or invokes **`/todo:add <text>`**:

1. **Capture-fast, confirm-never, surface-after.** Don't interrupt the current task with a confirmation prompt. Write the file, then mention it in one sentence in your next response: "Logged as a todo: `todos/<file>.md`."
2. **Title = the user's phrasing.** Don't paraphrase. "add a todo: dark mode toggle" → title "Dark mode toggle".
3. **One file per todo.** Multiple todos in one message → separate files. Never merge.
4. **Infer `area` from context**; default to `misc` if unclear. Don't ask just to set the area.
5. **Defaults**: `created: <today>` (from system context), `author` from the GitHub identity, omit `priority`.
6. **Disambiguate only when actionable.** If the title has no antecedent (e.g. "todo: fix the thing" with no "thing" in the conversation), ask. Otherwise log and move on.

## Reviewing — `/todo:list`

`/todo:list` lists all open todos (everything in `todos/` except `done/`), grouped by `area`, priority-first then oldest-first, reading only the frontmatter. This is the roadmap view. Keep todos short so this stays scannable. Pass an area (`/todo:list infra`) or a person (`/todo:list @handle`) to filter.

## Completing — `/todo:done`

When a todo is done, `git mv todos/<file>.md todos/done/`. Use `/todo:done <slug-or-title-fragment>` to do this. The frontmatter is left as-is; the folder records completion.

## When a todo outgrows the format

A todo is a one-screen capture. The moment its body grows past ~30 lines or sprouts multiple `##` sections, it has become a planning doc: move the detail to **`plans/<slug>.md`** and leave the todo as a short pointer to that plan. `plans/` is where fleshed, implementation-ready specs live.
