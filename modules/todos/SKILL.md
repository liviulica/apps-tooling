---
name: setup-todos
description: Add the file-based todos / roadmap system (from the apps-tooling blueprint) to the current project. Use when the user wants a lightweight todo, roadmap, or backlog system driven by slash commands, or says "add a todo system like daily-book / apps-tooling has", "set up todos", or "add /todo commands". Vendors three slash commands (/todo:add, /todo:list, /todo:done), a todos/ folder, and an app-owned convention doc. No runtime dependencies; works in any git repo, not just Expo/RN.
---

# setup-todos

Vendors the `todos` blueprint from the **apps-tooling** repo into the current project (Route B: the project owns the copy). It adds a git-tracked, one-file-per-item roadmap driven by slash commands. No npm deps, nothing in the app bundle — this works in any git repository, not only Expo/RN apps.

## What this produces in the target project

- `.claude/commands/todo/` — three slash commands (CORE): `/todo:add` (capture), `/todo:list` (roadmap), `/todo:done` (complete).
- `todos/` — the roadmap folder, with `todos/done/` for completed items (status is the folder, not a field).
- `todos/CLAUDE.md` — the convention doc (APP-OWNED): frontmatter schema, area taxonomy, author field, the "add a todo" behavior. The project customizes the area taxonomy here.

Frontmatter per todo: `title` (verbatim), `area`, `author` (GitHub handle), `created`, optional `priority`.

## Steps

Create a todo per step and work through them in order. (If this project doesn't have the todo commands yet, just track the steps in your head or with the built-in todo tool.)

1. **Locate the blueprint.** Find the `apps-tooling` repo (usually a sibling of the project under the same parent dir; otherwise ask for its path). Read `modules/todos/blueprint.json` — it is the source of truth for files and ownership. Everything below is driven by it.

2. **Confirm it's a git repo.** `/todo:done` uses `git mv`, and todos are meant to be committed. If `git rev-parse --is-inside-work-tree` fails, offer to `git init` first.

3. **Copy the files** listed in `blueprint.files` from `modules/todos/<from>` to `<project>/<to>`. **Ownership rule:** overwrite files marked `core` (the three commands + `done/.gitkeep`); for the file marked `app` (`todos/CLAUDE.md`), only copy if the destination does NOT already exist — never clobber a project's customized taxonomy on re-sync. Create the `.claude/commands/todo/` and `todos/done/` directories as needed.

4. **Customize the area taxonomy** in `todos/CLAUDE.md` to fit the project (only when freshly copied — never edit an existing app-owned copy). Look at the project (its directories, domains, existing labels) and replace the generic starter areas (`feature`, `bug`, `infra`, `ux`, `content`, `docs`, `misc`) with ones that match. Keep it short — a handful of areas that make `/todo:list` scan cleanly. If unsure, leave the generic set.

5. **Confirm the author identity resolves.** Run `gh api user -q .login 2>/dev/null || git config user.name`. Whatever it returns is what `/todo:add` will stamp as `author`. If both are empty, tell the user the field will be omitted until they set `git config user.name` or auth `gh` — don't block on it.

6. **Verify.** Walk `blueprint.verify`: capture a throwaway todo with `/todo:add`, confirm the file + frontmatter (including `author`), run `/todo:list`, then `/todo:done` it and confirm it moved to `todos/done/`. Delete the throwaway when done.

## Notes

- **No dependencies, framework-agnostic.** Unlike the other apps-tooling modules, this one is pure convention + slash commands. It suits any repo.
- Re-running the skill = a re-sync: the three commands + `done/.gitkeep` update; `todos/CLAUDE.md` (with its customized taxonomy) is preserved.
- The commands live under a fixed `/todo:` namespace so muscle memory transfers across every project that installs this. (An existing project may already use a different namespace, e.g. daily-book's `/db:*` — leave that alone; this module is for new installs.)
- `author` is for multi-user repos: it's stamped automatically from the GitHub identity at capture, and `/todo:list @handle` filters by person. Never prompt the user for their handle.
