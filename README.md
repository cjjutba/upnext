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

## v1.1 candidates (event model already supports them)

- Optional score entry on game-finished
- Hand-composed lineups (pull a chosen player onto a court)
- Recent-frequency ordering for the check-in grid
- Search on the check-in grid for the long tail of the roster
- PNG apple-touch-icon for iOS home screens
