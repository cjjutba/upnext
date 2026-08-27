# src/domain

The pure core. All correctness risk lives here, and it stays cheap to test
only while it stays free of I/O.

## Rules

- **Import nothing outside `src/domain`.** No React, no Dexie, no browser
  globals.
- **No impurity in `reducer.ts` or `templates.ts`.** No `Date.now()`, no
  `crypto.randomUUID()`, no `localStorage`. Timestamps arrive on the event
  envelope. Commands own id generation.
- **Every reducer case returns `state` unchanged when a guard fails.** Never
  throw. An imported log must not crash replay.
- **`replay()` is deterministic.** Same log in, same state out, every time.
  `invariants.test.ts` asserts it over random sequences.
- **Additive changes only** to the `EventPayload` union and `RuleTemplate`.
  Never repurpose an existing type or id. Old logs must replay identically.
- **Templates never run during replay.** `game-started` carries the full
  lineup. A pairing rule change must not rewrite past games.
- **The front four eligible players always play.** A mode picks the pairing,
  never the players.
- **Test first.** Write the failing case in the matching `*.test.ts`, watch it
  fail, then implement.

## Where things live

| File | Job |
|---|---|
| `types.ts` | Event union, `SessionState`, `emptyState()`, `isWinnersTemplate()` |
| `reducer.ts` | `replay()`, `applyEvent()`, `computeSkipped()`, `isPlaying()` |
| `templates.ts` | `nextLineup()`, `freshFill()`, `pickPairing()` |
| `commands.ts` | User intents. Return events or `null`, never persist |
| `modes.ts` | Mode metadata and mode to template mapping |

Full reference: `docs/event-model.md`.
