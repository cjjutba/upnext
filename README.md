# upnext

Courtside pickleball open play manager. Offline-first PWA: one organizer
device runs the whole session. Check players in, manage the paddle queue,
form games of four, rotate by house rules, undo anything. Four matching
modes: Balanced (recommended), Social mix, Classic queue, and Winners with
a split toggle.

The browser calls the games out loud so the organizer can put the tablet
down: court assignments, the up next four, the winning pair, and the podium
when the session ends. The speaker in the top bar mutes it and the choice
survives a reload. Every mode records a winner, so the trophy opens a live
standings table with wins, losses, and win rate for everyone checked in.

- Spec: docs/superpowers/specs/2026-08-26-upnext-open-play-design.md
- Design: docs/design/claude-design-brief.md (light mode only, monochrome, zero motion)
- Event sourced: all state replays from an append-only log in IndexedDB.
  Cloud sync later is an event upload; nothing here needs rework for it.

## Commands

- npm run dev: local dev server
- npm test: unit and property tests
- npm run build && npm run preview: production build, offline capable

## Shipped in v1.2

- Phone portrait layouts: the board, setup, and summary stack below 840px
- Two-tap end session, plus Reopen and View actions on session history
- Hand-composed lineups from a pencil on each court card
- Optional score entry on the win tap; the score rides the event log
- Check-in search past a dozen names, with regulars sorted first
- PNG install icons for iOS home screens and Android maskable shapes

## Later, if a night proves the need

- Roster delete and merge for duplicate players
- A warning when the browser denies persistent storage, plus export-all
- Manual queue reorder (needs its own event type)
- A guard against two tabs writing one log
