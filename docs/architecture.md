# Architecture

How upnext is put together. For the event catalog see `event-model.md`.

## The loop

```
screen  ->  command          ->  event store   ->  reducer        ->  screen
            domain/commands      db/eventStore     domain/reducer
            returns events       appends to        replay(log)
            or null              IndexedDB         -> SessionState
```

Concretely, finishing a game on court 2:

1. `SessionBoard` calls `onFinish(2)`, which `App.tsx` maps to
   `cmd.finishGame(state, 2, undefined, roster.ratings)`.
2. `finishGame` returns a `game-finished` event plus any `game-started` events
   the freed players make possible. It returns `null` if the court is empty,
   the session has ended, or a winners mode needs a winner it was not given.
3. `useSession.dispatch` runs the array through `append()` one at a time.
   Each write gets a ULID, the device id, the next `seq`, and a timestamp.
4. The appended events land in an in-memory log; `useMemo` calls `replay()`.
5. React renders the new `SessionState`.

Nothing skips a step. There is no path that mutates state directly.

## Layers

Imports point one direction. The pure core sits at the bottom and knows
nothing about React, Dexie, or the DOM.

| Layer | Directory | Depends on |
|---|---|---|
| Pure core | `src/domain` | nothing internal |
| Persistence | `src/db` | domain |
| React state | `src/state` | db, domain |
| Browser helpers | `src/lib` | db, in `exportFile.ts` only |
| Presentation | `src/components`, `src/screens` | domain types |
| Wiring | `src/App.tsx` | everything |

The reason for the direction: the reducer and the templates hold all the
correctness risk, and they are cheap to test only while they stay free of I/O.
`src/domain/invariants.test.ts` drives 120 randomly generated command
sequences through the real command layer on every run, which is only cheap
because nothing in that layer touches a database.

One exception exists. `src/screens/RosterSetup.tsx` calls `listSessions()`
from `src/db/eventStore.ts` to render session history. Do not add more.

## File map

### `src/domain` (pure, no I/O)

| File | Job |
|---|---|
| `types.ts` | `EventPayload` union, `SessionState`, `Player`, `RuleTemplate`, `emptyState()`, `isWinnersTemplate()` |
| `reducer.ts` | `replay()`, `applyEvent()`, `computeSkipped()`, `isPlaying()` |
| `templates.ts` | Pairing selection: `nextLineup()`, `freshFill()`, `pickPairing()`, `pairHistory()`, `gamesTogether()` |
| `commands.ts` | Every user intent as a function returning events or null, plus `undoTarget()`, `redoTarget()`, `describeEvent()` |
| `modes.ts` | User-facing mode metadata and the mode to template mapping |

### `src/db`

| File | Job |
|---|---|
| `db.ts` | Dexie subclass. Three tables, schema version 1 |
| `eventStore.ts` | `append()`, `loadSession()`, `listSessions()`, `lastSessionAttendees()`, `exportSession()`, `importSession()` |

### `src/state`

| File | Job |
|---|---|
| `useSession.ts` | Owns the event log, dispatch, undo, redo, resume |
| `useRoster.ts` | Owns the players table: add, update, ratings map |

### `src/lib`

| File | Job |
|---|---|
| `ids.ts` | `newId()` monotonic ULID, `getDeviceId()` from `localStorage` |
| `useRoute.ts` | Hash router. `#/setup`, `#/board`, `#/summary`. No dependency |
| `useWakeLock.ts` | Holds a screen wake lock while the board is up |
| `exportFile.ts` | Web Share with a file, falling back to download. Import from a file |

### `src/components`

Seventeen presentational components: `Button`, `CheckinTile`, `CountBadge`,
`CourtCard`, `CourtDiagram`, `Icon`, `IconButton`, `ModeChangeModal`,
`ModeMenu`, `PlayerChip`, `QueueRow`, `RuleCard`, `StandingsModal`,
`StatusBadge`, `Stepper`, `TimerDisplay`, `UndoPill`. Rules in
`src/components/CLAUDE.md`.

### `src/screens`

| File | Route | Job |
|---|---|---|
| `RosterSetup.tsx` | `#/setup` | Roster, player editor, mode picker, court count, history, import |
| `SessionBoard.tsx` | `#/board` | Courts, queue, check-in grid, undo and redo |
| `SessionSummary.tsx` | `#/summary` | Per-player table, session length, export |

### `src` root

| File | Job |
|---|---|
| `src/App.tsx` | Wires hooks to screens, resumes a live session on load, holds the header |
| `src/main.tsx` | Mounts React, requests `navigator.storage.persist()` |
| `src/styles/tokens.css` | Every design token |
| `src/styles/base.css` | Reset plus four utility classes: `.mono`, `.timer`, `.display`, `.micro-label` |

## The command layer

The least obvious file in the repo, and worth understanding before you touch
it.

A command does not persist anything. It reads the current `SessionState` and
returns the events that should follow, leaving the caller to append them. That
is what makes commands testable without a database and what lets
`useSession.dispatch` treat every intent identically.

Three details carry weight:

**Commands simulate their own events.** `simulate()` runs an event through
`applyEvent` with a fake envelope so the command can see the state its first
event produces and decide what follows. A check-in that brings the queue to
four has to know the player is queued before it can fill a court. The sim
envelopes never leave the module, so the module-level counter behind them is
unobservable.

**Refusal is `null`, not an exception.** Every command returns `null` when the
intent does not apply: departing a player who is mid-game, finishing an empty
court, re-selecting the mode that is already active. `dispatch` accepts null
and warns in dev. This is how double taps and stale state stay harmless.

**Fill order is load bearing.** `fillEvents()` takes an optional `onCourt`
and fills that court first, and it is the only court that sees `lastFinished`.
Without that, winners who won on court 2 would be handed to court 1 because
court 1 happens to be numbered lower. `src/domain/commands.test.ts` pins this
with a test that engineers court 1 empty while court 2 holds the game.

## Auto-fill

Every command that could free or add capacity ends by calling `fillEvents()`:
`startSession`, `finishGame`, `checkInPlayer`, `returnPlayer`, `closeCourt`,
`reopenCourt`, `addCourt`, `changeRule`. Courts fill eagerly, so a court is
never left empty while four eligible players wait.

`changeRule` is the defensive one. Every capacity-increasing command already
filled, so it is normally a no-op. That is deliberate: a mode switch governs
the next fill and never rewrites a court already playing. `ModeChangeModal`
confirms the switch before it is appended and says so in as many words.

## Persistence

Three Dexie tables in one database named `upnext`, schema version 1.

| Table | Key | Holds |
|---|---|---|
| `players` | `id` (UUID) | The long-lived roster. Not events |
| `sessionEvents` | `id` (ULID) | Every event, from every session, forever |
| `meta` | `key` | The per-device `seq` counter |

There is no sessions table. The compound `[type+sessionId]` index answers "what
sessions exist" by pulling `session-started` and `session-ended` rows without
replaying anything. `[sessionId+seq]` is reserved for multi-device sync
ordering and is not read yet.

Schema details and the export format are in `event-model.md`.

## Resume and crash recovery

A session with no `session-ended` event is live. On load, `App.tsx` calls
`listSessions()`, and if a live one exists it loads that log and navigates to
`#/board`. That is both the crash story and the handoff story: an imported
in-progress session resumes the same way.

Starting a new session first appends `session-ended` to any dangling live
session, so history never holds two in-progress logs.

## Extension recipes

The three common changes, with file order. Write the failing test first in
every case.

### A new event type

1. `src/domain/types.ts`: widen `EventPayload`. Additive only.
2. `src/domain/reducer.test.ts`: the failing case, including a no-op case for
   an invalid version of the event.
3. `src/domain/reducer.ts`: the `case` in `applyEvent`. Guards first, then the
   new state. Return `state` unchanged when a guard fails.
4. `src/domain/commands.test.ts`: the failing command case.
5. `src/domain/commands.ts`: the command, returning `null` when refused, plus
   a `describeEvent()` label so the undo pill reads properly.
6. `src/App.tsx` and the relevant screen.

No Dexie migration. Events are one table with one envelope.

### A new matching mode

1. `src/domain/types.ts`: add the id to `RuleTemplate`.
2. `src/domain/templates.test.ts`: the pairing cases you expect.
3. `src/domain/templates.ts`: the selection in `nextLineup()` or
   `pickPairing()`.
4. `src/domain/reducer.ts`: only if the queue placement on finish differs from
   all-off. Non-winners templates already route through that path.
5. `src/domain/modes.ts`: the `MODES` entry and both mapping functions.
   `modeLabel()` is total and falls back to the raw id, so a missing entry is
   caught by `src/domain/modes.test.ts` rather than thrown at a user.
6. `src/domain/modes.test.ts`: the id in `ALL_TEMPLATES`, which the coverage
   case reads. This is the tripwire for a forgotten `MODES` entry.
7. `src/screens/RosterSetup.tsx`: the `MODE_ICON` entry.
8. `src/domain/invariants.test.ts`: the id in `TEMPLATES`, which feeds both the
   boot template and the mid-run `rule` op, so the property suite switches into
   and out of the new mode.

### A new screen

1. `src/lib/useRoute.ts`: the `Route` union and `parse()`.
2. `src/screens/`: the component, props in and callbacks out.
3. `src/App.tsx`: the render branch and the header branch.
