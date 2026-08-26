# upnext design spec

Date: 2026-08-26
Status: approved design, pre-implementation

## Purpose

upnext is an offline-first PWA that one organizer uses courtside to run a
pickleball open play session end to end: check players in, hold the queue,
form games of four, assign courts, rotate by a chosen rule template, and
survive a night of bad gym Wi-Fi without noticing it. Cloud sync is a v2
concern, and every v1 decision below is made so that sync later is an event
upload, not a rewrite.

## Scope

In scope for v1:

- Single organizer device, fully offline. One tablet or phone runs the session.
- Persistent local roster of players.
- Session setup: court count, rotation template, template config (win cap).
- Check-in, latecomers, early departures, sit-outs.
- Game formation from the queue, winner recording, rotation per template.
- Manual override: the organizer composes or edits a lineup by hand instead of
  taking the engine's pick.
- Courts going out of service and back in (lights, puddle, someone borrowed it).
- Undo, recorded as an event, with redo.
- Rule template change mid-session.
- Per-court elapsed game timer.
- Screen wake lock during a live session.
- Export and import of a session as JSON, for backup and device handoff.
- Session summary and browsable session history.

Out of scope for v1, with doors deliberately left open:

- Player phones in any capacity.
- Accounts, auth, or any backend.
- Cloud sync (see final section for the v2 shape v1 must not break).
- Skill-aware matching. Players carry an optional level field that the engine
  ignores.

## Data model

Two Dexie tables in IndexedDB. Nothing else persists.

### players

| Field | Notes |
|---|---|
| id | UUID via `crypto.randomUUID()`. Never Dexie autoincrement, which collides the moment a second device syncs a roster. |
| name | Display name. |
| level | Optional free-form tag. Unused by the v1 engine. |
| createdAt, updatedAt | Timestamps. |

### sessionEvents

Append-only. A session is nothing but its events. Every event carries this
envelope:

| Field | Notes |
|---|---|
| id | ULID (time-sortable, globally unique). Canonical replay order is id ascending. |
| sessionId | UUID, generated at session start. |
| deviceId | UUID generated once per install and stored in Dexie. |
| seq | Per-device monotonically increasing sequence number. Tiebreaker within one device, and the ordering backbone once sync exists. |
| ts | Wall-clock timestamp. |
| v | Event schema version, starting at 1. The reducer upgrades old events on read, so long-lived history never needs a table migration. |
| type, payload | See below. |

Event types and payloads:

- `session-started { courts, template, config }`
- `rule-changed { template, config }`
- `player-checked-in { playerId }`
- `player-departed { playerId }`
- `player-sat-out { playerId }`
- `player-returned { playerId }`
- `game-started { court, pairs: [[a, b], [c, d]] }`. The lineup is fully
  written into the event at decision time.
- `game-lineup-changed { court, pairs }`. Manual override or partner swap.
- `game-finished { court, winnerPair?, score? }`. `winnerPair` is 0 or 1,
  present only when the active template needs a winner.
- `court-closed { court }`
- `court-reopened { court }`
- `event-undone { targetEventId }`
- `session-ended {}`

Indexes: a compound `[type+sessionId]` index so the history screen pulls
`session-started` and `session-ended` events cheaply without a third table and
without replaying everything, plus `[sessionId+seq]` for replay. Do not add a
sessions table; the index is the sessions table.

### Reducer rules

The reducer is a pure function `replay(events) -> state`. Derived state, which
is never stored: queue order, court occupancy and lineups, who is sitting out,
per-player games-played and win counts, current rule config.

- Replay never re-runs templates. `game-started` events carry the full lineup,
  so a template tweak next month cannot rewrite what happened last Tuesday.
- The queue is derived purely from check-in order, departures, sit-outs, and
  which games each player appeared in. There are no queue-reorder events. If a
  manual queue reorder ships later, it gets its own explicit event type.
- Rule config lives in derived state, seeded by `session-started` and updated
  by `rule-changed`. The reducer reads it from state, never directly from
  `session-started`, so mid-session rule changes are one event, not a redesign.
- `event-undone` makes the reducer skip the target event. The log stays
  append-only, the audit trail stays complete, and redo falls out for free: an
  `event-undone` targeting a prior `event-undone` reinstates the original.
  The UI offers only sequential undo and redo: undo targets the newest event
  that is not undone and not itself an `event-undone`, redo targets the newest
  `event-undone` that has not itself been undone. Dangling states cannot occur.
- Invalid events are no-ops. The UI prevents them (no double check-in, no
  finishing an empty court), but the reducer also ignores events that do not
  apply to current state, so an imported log from another device cannot crash
  replay.

## Rotation templates

A template is a pure function: given a finished game and current derived
state, it returns the `game-started` payload for that court, or nothing when
fewer than four eligible players exist. Templates decide; the reducer applies.
Adding a template later means adding one function.

The three v1 templates:

1. **All four off.** The finished four go to the back of the queue in lineup
   order (pair 0 then pair 1), and the next four in line take the court. No
   winner selection required.
2. **Winners stay.** The winning pair keeps the court, losers go to the back,
   and the next two players in the queue come on as the challenger pair. The
   win cap is set at session setup. When the cap is hit, both winners go to
   the back of the queue.
3. **Winners split.** Defined precisely, since groups use the phrase loosely:
   the winners stay but separate, each partnering a new player from the front
   of the queue. The first-listed winner pairs with queue position 1, the
   second with queue position 2. Losers go to the back.

Formation rules the engine applies regardless of template:

- Fresh fills pair queue positions 1 and 3 versus 2 and 4, which mixes people
  who arrived together. The court card offers a one-tap partner swap, emitted
  as `game-lineup-changed`.
- A court fills only when four eligible players are available. Never a game of
  three; an underfilled court sits empty.
- Exactly four players on one court under all four off rotates through the
  three possible pairings rather than repeating the same pairs.
- Closed courts are never filled. Closing a court with a game in progress
  returns its four players to the front of the queue in lineup order, since
  they were mid-game through no fault of their own.
- Latecomers join the back of the queue. Departing removes a player.
- Sitting out freezes the player's queue position and the game-former skips
  them until they return. This is a deliberately generous default: it works
  for bathroom breaks and technically rewards a twenty-minute wander, but the
  always-visible games-played count self-corrects that socially.
- A `rule-changed` event takes effect immediately: whenever a game finishes
  after it, the active template decides both the winner prompt and the
  rotation, including games that started under the old template.

## UI

Three screens. Tablet landscape first, phone portrait usable. Big touch
targets throughout, because the organizer is holding a paddle in the other
hand.

### Roster and start

Manage players (add, rename, level tag), configure a session (court count,
template, win cap), start it. Below setup, the session history list, fed by
the `[type+sessionId]` index. Import of a session JSON lives here too. A
session with no `session-ended` event is in progress: opening the app while
one exists lands on the live screen, and an imported in-progress session is
resumable the same way. That is both the crash story and the handoff story.

### Live session

The screen that is the product.

- Court cards across the top: the two pairs, an elapsed timer derived from the
  `game-started` timestamp (long games are what make queues feel unfair, and
  the timer is the one thing a paddle rack cannot do), and the finish
  interaction. Winner selection is template-driven: under all four off, one
  tap finishes the game and refills the court; under winners stay and winners
  split, the organizer taps the winning pair. Score entry stays optional
  everywhere. Each card also offers partner swap, manual lineup compose, and
  close or reopen court.
- The queue below: numbered list, games-played count per player, sit-out
  toggles.
- Check-in is a tap grid of roster names sorted by recent frequency, with
  search kept for the long tail. Mid-session on a phone, tapping beats typing.
- A prominent undo button, emitting `event-undone`.
- Wake lock: `navigator.wakeLock.request('screen')` on entering the live
  screen, re-requested on `visibilitychange`. A tablet that sleeps every two
  minutes is unusable propped on a chair.
- Export: a share-session-as-JSON button via the Web Share API. This is the
  backup story until sync exists, and paired with import it is the device
  handoff story when the organizer leaves early. Import merges by event id
  (union, idempotent) and merges roster entries by UUID.

### Session summary

Shown on session end and reachable from history: games per player, wins where
the template tracked them, session length. Entirely derived from the log.

## Stack

- Vite, React, TypeScript.
- Dexie over IndexedDB, with schema versioning planned from day one, since the
  roster is long-lived and fields will be added.
- `vite-plugin-pwa` for installability and the offline shell.
- `navigator.storage.persist()` requested on first run to resist eviction.
  Export exists because persist reduces eviction risk without eliminating it,
  and a lost log is a lost night.
- In-memory state is the replay result, held behind `useReducer` or a thin
  Zustand wrapper around the pure reducer. A reload mid-session replays the
  log and lands exactly where it was.
- Static deploy on Vercel. No server component exists in v1.

## Testing

All correctness risk lives in the reducer and the templates, and both are pure
functions.

- Vitest unit tests for each template's happy path and the edge cases named
  above: win cap hit, five-player winners stay, four-player pairing rotation,
  court closed mid-game, sequential undo and redo.
- Property-based tests with fast-check over random valid event sequences,
  asserting invariants: no player appears on two courts at once; every open
  court has exactly four distinct players or none; checked-in players equal
  on-court plus queued plus sitting-out plus departed; replay is
  deterministic; undoing then redoing any event restores identical state.
  Random inputs through a pure reducer find the bugs unit cases miss.

## Cloud sync later

v2, recorded here only so v1 cannot accidentally break it. A small backend
(Supabase fits) receives event batches and syncs rosters. Upload happens
whenever the device is online. Roster merge is by player UUID with
last-write-wins on name, since the same person may be added on two devices
before sync exists. The ULID ids, deviceId, per-device seq, schema version
field, and undo-as-event mean a v1 log uploads as-is. Player phones as
read-only queue viewers become possible once this layer exists. None of it is
v1 work.
