# CLAUDE.md

@AGENTS.md

The file above is the canonical context. Keep it that way: when you learn
something durable about this codebase, add it to `AGENTS.md`, not here. This
file holds only what is specific to running Claude Code on this repo.

## Conductor workspaces

This repo runs in several Conductor workspaces at once, each on its own
branch against the same codebase. As of 2026-08-27 that included
`text-to-speech-court-announcer`, `pickleball-board-redesign`, and
`missing-vital-webapp-features`.

- Work inside your workspace directory. Do not reach into a sibling.
- The target branch for diffs and PRs is `origin/main`:
  `git diff origin/main...` and `gh pr create --base main`.
- `.context/` is gitignored scratch space for passing notes between agents.
- Assume another agent may be editing the same file. Rebase before you merge,
  and read `git log origin/main` before assuming your view of the code is
  current.
- `.conductor/settings.toml` holds the setup, run, and archive scripts. It is
  the shared file on purpose: Conductor reads it from `origin/main`, so it
  works even when the root checkout at `~/Projects/upnext` is behind. A
  `settings.local.toml` would be read from that checkout instead.
- Setup runs `npm install`, so a new workspace arrives with `node_modules`.
  Run it by hand only if the directory is missing.

## Skills worth reaching for

- `superpowers:test-driven-development` for anything in `src/domain`. The
  reducer and templates are pure functions, which is exactly where a failing
  test first pays off.
- `superpowers:systematic-debugging` for replay and queue-order bugs. These
  reproduce from a log, so guessing is never necessary.
- `unslop` for any prose you write, including commit messages and doc edits.

## The plan documents are history

`docs/superpowers/plans/` holds 4,400 lines of task-by-task plans that were
executed and then partly superseded. They read like instructions and they are
not. `docs/README.md` lists the known stale claims. Check the code first.
