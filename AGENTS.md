# AGENTS.md

Canonical context for coding agents working on upnext. Claude Code reads this
through `CLAUDE.md`. Every claim here was checked against the code, not copied
from the specs, which have drifted. See `docs/README.md` for the drift list.

## What upnext is

An offline-first PWA that one organizer runs courtside to manage a pickleball
open play session. Check players in, hold the paddle queue, form games of
four, start them by hand, rotate by the chosen matching mode, undo anything.
No backend, no accounts, no player phones. A session is an append-only event
log in IndexedDB, so cloud sync later is an upload rather than a rewrite.

Stack: Vite, React 19, TypeScript, Dexie over IndexedDB, ulidx, lucide-react,
vite-plugin-pwa. Vitest with jsdom, fake-indexeddb, and fast-check. Roughly
2,500 lines of source across 34 files, 149 test cases in 11 test files.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Needed first in a fresh workspace. `node_modules` is not committed |
| `npm run dev` | Vite dev server |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest watch mode |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | Serve the build. The only way to check offline behavior |
| `npx oxlint` | Lint. There is no `lint` script; the config is `.oxlintrc.json` |

One file at a time: `npx vitest run src/domain/reducer.test.ts`.

## How state works

There is one loop, and no session state outside it.

1. A screen calls a command in `src/domain/commands.ts`.
2. The command returns `CommandEvent[]`, or `null` when it refuses the intent.
3. `dispatch` in `src/state/useSession.ts` passes each to `append()` in
   `src/db/eventStore.ts`, which stamps the envelope and writes to Dexie.
4. `replay()` in `src/domain/reducer.ts` folds the whole log into a
   `SessionState`.
5. React renders that state.

`SessionState` is never persisted. A reload replays the log and lands exactly
where it was. If you are about to add a `useState` that holds session truth,
stop. It belongs in an event.

### Staged, then started

No game starts on its own. A command that frees capacity emits `game-staged`,
which puts four people on a court with the clock stopped, and the organizer
taps Start to emit `game-started`. Staged players leave the queue, so a
checked-in player is in exactly one of three places: the queue, `state.staged`,
or `state.games`.

Read `docs/architecture.md` for the full picture and `docs/event-model.md` for
every event type.

## Layer map

Imports point one direction. Nothing below reaches up.

| Directory | Job | May import |
|---|---|---|
| `src/domain` | Pure core: types, reducer, templates, commands, mode metadata | only `src/domain` |
| `src/db` | Dexie schema, append and load, export and import | `src/domain` |
| `src/state` | Hooks owning the event log and the roster | `src/db`, `src/domain` |
| `src/lib` | Browser helpers: ids, hash route, wake lock, file share | `src/db` (in `exportFile.ts` only) |
| `src/components` | Presentational. Props in, callbacks out | `src/domain` types and `modes.ts` |
| `src/screens` | Layout for the three routes | components, `src/domain` |
| `src/App.tsx` | Wiring: routes, commands, roster, resume, wake lock | everything |

One deliberate exception: `src/screens/RosterSetup.tsx` calls `listSessions()`
directly for the history list. Do not add more.

## Seven rules that break the product if you violate them

1. **The log is append-only.** Undo appends an `event-undone` event. Never
   delete or rewrite a row in `sessionEvents`. `computeSkipped()` in
   `src/domain/reducer.ts` is what makes an event stop counting.
2. **`replay()` stays pure and deterministic.** No `Date.now()`, no
   `crypto.randomUUID()`, no I/O inside `reducer.ts` or `templates.ts`. The
   same log must always produce the same state, which
   `src/domain/invariants.test.ts` asserts.
3. **Templates never re-run during replay.** A `game-started` event carries
   the full lineup, so changing a pairing rule next month cannot rewrite what
   happened last Tuesday. Commands decide, the reducer records.
4. **Invalid events no-op, they never throw.** Every case in `applyEvent`
   returns `state` unchanged when its guard fails. A log imported from another
   device, or written by a newer build, must not crash replay.
5. **The front four eligible players always play.** A matching mode chooses
   the pairing among the three possible partitions, never the players. See
   `eligible()` and `nextLineup()` in `src/domain/templates.ts`. This is the
   paddle-rack promise and it is not tradeable for pairing quality. The
   organizer can override it by hand through `substitutePlayer` or
   `swapQueue`; a mode still never does.
6. **Never change the meaning of an existing event type or template id.** Old
   logs must replay identically. Widen unions, add cases, add optional fields.
   Do not repurpose.
7. **No en dashes, no em dashes, no motion.** Not in code, comments, copy,
   commits, or docs. Zero CSS transitions and zero animations anywhere. Full
   design rules in `docs/conventions.md`.

## Adding things

### A new event type

1. `src/domain/types.ts`: widen the `EventPayload` union. Additive only.
2. `src/domain/reducer.test.ts`: write the failing case first.
3. `src/domain/reducer.ts`: add the `case` to `applyEvent`. Guard first,
   return `state` unchanged when the event does not apply.
4. `src/domain/commands.ts`: add the command that emits it, returning `null`
   when refused, and add a label to `describeEvent()` so the undo pill reads
   properly. If a command emits it as an automatic fill rather than an
   organizer's intent, mark it the way `game-staged` marks `auto`, so
   `undoTarget()` skips it and one undo still reverts one action.
5. Wire the UI through `src/App.tsx`.

The Dexie schema does not change. Events are one table with one shape.

### A new matching mode

1. `src/domain/types.ts`: add the id to `RuleTemplate`.
2. `src/domain/reducer.ts`: only touch `game-finished` if the queue placement
   differs. Any template that is not a winners template already falls through
   the all-off path.
3. `src/domain/templates.ts`: add the pairing choice in `nextLineup()` or
   `pickPairing()`.
4. `src/domain/modes.ts`: add the entry to `MODES` plus both mapping
   functions. `modeLabel()` uses a non-null `find`, so a missing entry throws.
5. `src/screens/RosterSetup.tsx`: add the icon to `MODE_ICON`.
6. Tests: pairing cases in `templates.test.ts`, and add the id to the
   `template` arbitrary in `invariants.test.ts` so the property suite covers it.

### A new screen

1. `src/lib/useRoute.ts`: add to the `Route` union and to `parse()`.
2. `src/screens/`: new component taking props and emitting callbacks.
3. `src/App.tsx`: add the render branch and the header branch.

## Conventions

- Named exports. No default exports except `App.tsx`.
- `import type { ... }` for types. `verbatimModuleSyntax` is on and will
  reject a plain type import.
- Comments explain why, not what. Look at `src/domain/reducer.ts:169` for the
  register: short, load-bearing, and about a decision.
- Tests sit next to the code as `*.test.ts` or `*.test.tsx`.
- Styling is inline `style={{}}` reading CSS custom properties. No CSS
  modules, no Tailwind, no styled-components. Tokens live in
  `src/styles/tokens.css`.
- Commit messages use conventional prefixes, lowercase, no scope:
  `feat:`, `fix:`, `docs:`, `test:`. One commit per finished task.

## Before you claim done

```bash
npm test
npm run typecheck
npm run build
grep -rnP '[\x{2013}\x{2014}]' src docs *.md index.html && echo FOUND || echo CLEAN
```

All green and CLEAN. For UI changes, also load the app and drive the real
flow. A passing test is not evidence that a court card renders.

## Where to read next

| Doc | Read it when |
|---|---|
| `docs/architecture.md` | You need the layer boundaries or the command layer |
| `docs/event-model.md` | You are touching events, the reducer, or the queue |
| `docs/conventions.md` | You are writing UI or prose |
| `docs/decisions.md` | You want to know why something is the way it is |
| `docs/README.md` | You are about to trust a spec or plan document |

`docs/superpowers/plans/` is a record of executed work, not a specification.
Parts of it are stale. Do not follow it as instructions.
