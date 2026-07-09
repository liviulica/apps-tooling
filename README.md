# apps-tooling

Reusable **modules** (blueprints) for our Expo / React Native apps. Pick and
choose per app: analytics, paywalls, profile, onboarding, and so on. One repo,
many modules.

## The model: vendored blueprints (Route B)

A module is **copied into** an app (it owns the code from then on), not installed
as a versioned dependency. This is the [shadcn/ui](https://ui.shadcn.com) model.
We chose it because:

- Most modules are feature scaffolds you customize per app (a paywall, a profile
  screen) — the app should own and edit them.
- Zero publishing / registry friction.
- A Claude Code **skill** per module does the install + wiring + prompting.

Trade-off: updates don't auto-propagate. Re-run the module's skill to re-sync
(core files update; app-owned files like event taxonomies are never clobbered).

> npm can't install a single package from a subdirectory of a git repo, so a
> monorepo's realistic distribution options are "publish each package" or
> "vendor the code". We vendor. A stable pure-logic module can still be published
> as a package later if auto-updates become worth it.

## Anatomy of a module

Every module follows the same shape so the pattern repeats:

```
modules/<name>/
  template/        # files vendored into the app
  blueprint.json   # manifest: files (+ ownership), deps, env keys, root wiring
  SKILL.md         # the Claude skill: the prompting + setup steps
  README.md        # what it does, how to use, how to extend
```

- **`blueprint.json`** makes a module self-describing. A skill (or a future
  generic CLI) reads it to know what to copy, install, and wire.
- **`ownership`** per file: `core` files are overwritten on re-sync; `app` files
  (e.g. an app's event list) are written once and never clobbered.

## Modules

| Module | Status | What it adds |
|---|---|---|
| [analytics](./modules/analytics) | ✅ v1 | Product analytics via Amplitude |
| [accounts](./modules/accounts) | 🚧 v0.1 | Accounts + cross-device sync via Supabase (Apple/Google/email OTP) |
| [onboarding](./modules/onboarding) | 🚧 v0.1 | First-run onboarding engine (step shell + first-run gate; ties into accounts) |
| [todos](./modules/todos) | ✅ v1 | File-based todo/roadmap system via slash commands (`/todo:add\|list\|done`). No deps; any git repo |
| paywall | planned | Subscriptions / paywall (RevenueCat; webhook stub ships with accounts) |

## Using a module in an app

1. Make sure this repo is cloned (typically a sibling of your app).
2. Make the module skills available to Claude Code: symlink them into
   `~/.claude/skills/`, e.g.
   `ln -s "$PWD/modules/analytics" ~/.claude/skills/setup-analytics`.
3. In the target app, run the skill (e.g. `/setup-analytics`) and follow it.

Or do it by hand using the module's README + `blueprint.json`.

## Adding a new module

Copy an existing module's shape, fill in `template/`, `blueprint.json`,
`SKILL.md`, `README.md`. Keep the public surface small and the per-app editable
parts clearly marked `ownership: app`. Build it against one real app first, then
generalize.
