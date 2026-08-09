# todos

A git-tracked, file-per-item **todo / roadmap system** driven by slash commands. Extracted from daily-book, genericized for any repo.

- **Zero runtime deps.** No npm packages, nothing in the app bundle. `todos/` lives outside the import graph, so it never ships. Works in any git repo, not just Expo/RN.
- **Status is the folder.** A file in `todos/` is open; `git mv` it to `todos/done/` and it's done. No `status` field to maintain, no registry — filenames are the index.
- **Capture-fast.** `/todo:add dark mode toggle` writes `todos/<date>-dark-mode-toggle.md` without interrupting the current task.

## Commands

| Command | Does |
|---|---|
| `/todo:add <text>` | Capture a todo. Title = your verbatim phrasing; area inferred; author stamped from your GitHub handle. |
| `/todo:list [area \| @handle]` | The roadmap: open todos grouped by area, priority-first then oldest-first. Optional filter by area or person. |
| `/todo:done <slug or title>` | `git mv` the todo into `todos/done/`. |

## Frontmatter

```yaml
---
title: "Dark mode toggle"   # verbatim from the user
area: ux                    # customizable taxonomy (see todos/CLAUDE.md)
author: octocat             # GitHub handle, stamped automatically at capture
created: 2026-07-09
priority: med               # optional: low | med | high, set during review
---

> "add a todo: dark mode toggle"
```

**Author** is resolved at capture from `gh api user -q .login`, falling back to `git config user.name` — for multi-user repos, so `/todo:list @handle` can filter to one person. Never prompted for.

## Install

Run the `/setup-todos` skill in the target project (see the repo root README for making module skills available to Claude Code), or do it by hand from `blueprint.json`:

- Copy `template/.claude/commands/todo/*` → `.claude/commands/todo/` (CORE).
- Copy `template/todos/CLAUDE.md` → `todos/CLAUDE.md` (APP-OWNED — customize the area taxonomy; never clobber on re-sync).
- Copy `template/todos/done/.gitkeep` → `todos/done/.gitkeep` (CORE).

No deps to install, no env, no root wiring.

## Extending

- **Areas** are yours: edit the taxonomy in `todos/CLAUDE.md` per project.
- **Graduate to a plan.** When a todo's body outgrows ~30 lines, move the detail to `plans/<slug>.md` and leave the todo as a pointer.
- **Namespace** is a fixed `/todo:` so it's the same across every project. A repo that predates this module may use its own prefix — that's fine; this module is for new installs.
