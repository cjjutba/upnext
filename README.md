# upnext

Courtside pickleball open play manager. Offline-first PWA: one organizer
device runs the whole session. Check players in, manage the paddle queue,
form games of four, rotate by house rules, undo anything.

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
- PNG apple-touch-icon for iOS home screens
