# upnext design brief

Date: 2026-08-26, revised same day to v2 (light monochrome).
Canonical design direction for upnext. The Claude Design system is the
visual source of truth; this file records the direction and the reasoning.
The active revision prompt lives in `claude-design-prompt-v2.md`.

## The one-line direction (v2)

Courtside equipment built by the Vercel design team: white, precise,
instant. Light mode only, monochrome Geist-grade palette, text-only status
badges, zero motion, giant tabular timers.

v1 of this brief ("broadcast scoreboard minimalism": dark-first, optic-lime
accent, Barlow Condensed, IBM Plex Mono, 150 to 250ms motion) is
superseded. The lime accent read generic, the dark default was dropped for
a single light theme in v1, and all motion was removed for snappiness.

## Hard rules

- Light mode only in v1. No dark tokens, no theme switcher. Dark mode is a
  future designed theme, never an inversion.
- Monochrome interactive layer: primary buttons are solid #171717 with
  white text, never colored. Structure comes from 1px alpha borders, not
  shadows (menus and modals are the only shadowed surfaces).
- Blue #006bff only as a state signal: focus rings and text links. The
  next-four queue highlight is monochrome (gray 100 fill, 2px #171717 left
  bar, "Next up" label).
- Status badges are text-only pills: the word alone, no dots, no circles,
  no icons. Tinted background with dark same-hue text (green #effbef and
  #297a3a, amber #fff6e5 and #a35200, red #ffeeef and #c33236, neutral
  #f2f2f2 and #4d4d4d). The word is the signal.
- No motion anywhere. No transitions, no easing, no press scale, no slide,
  no shimmer. State changes are instant; press feedback is an instant one
  step background or border shift.
- No en dashes and no em dashes in any copy, code, or docs. Commas,
  colons, periods, and "to" for ranges.
- Typography is Geist Sans (400/500/600) and Geist Mono (tabular, all
  numerals: timers 64 to 96px, counts, positions, stat columns). Wordmark
  is lowercase "upnext" in Geist Sans 600. No logo.
- Lucide icons, 1.5px stroke, labeled except close, back, overflow.
- Radii: 6px controls, 8px cards, 12px modals, 9999px pills.
- 8pt spacing grid. Touch targets 48px minimum, primary actions 56px or
  more. One primary action per card. WCAG AA.
- Flat solid fills. No gradients, glassmorphism, purple, or emoji.

The full token values and enforcement wording are in
`claude-design-prompt-v2.md`. They are lifted verbatim from CJ's
Geist-Grade Design System export so upnext inherits that system's logic
(scale jobs, alpha borders, badge tinting, monochrome pillars).

## Screens (unchanged)

1. Live session board: court cards (court number, pairs, huge elapsed
   timer, template-driven finish tap), queue with games-played counts and
   sit-out toggles, check-in tap grid sorted by recent frequency, always
   visible undo, session clock in header.
2. Roster and session setup: player list, court count stepper, rule
   template picker, win cap, start button, session history.
3. Session summary: per-player stat table, session length, export.

## Reference shots (docs/design/references/)

Pulled from Mobbin 2026-08-26 for the v1 brief. Still valid for structure
and interaction; ignore their palettes and any dark styling, which v2
supersedes.

| File | Source | Take this (structure only) |
|---|---|---|
| 01-thescore-court-lineup.png | [theScore lineups](https://mobbin.com/screens/8df66e45-a10c-44e0-9088-e05a26d134bd) | Pairs arranged on a stylized court outline |
| 02-riot-match-details.png | [Riot Mobile match details](https://mobbin.com/screens/272f910f-30ff-4080-b7d9-62c0e83d4780) | Roster with per-player stat columns |
| 03-nba-box-score.png | [NBA box score](https://mobbin.com/screens/cebf4f9b-db58-46a7-840f-cff431fb1cfc) | Dense, scannable stat table typography |
| 04-classdojo-attendance-grid.png | [ClassDojo attendance](https://mobbin.com/screens/3f1f396d-ab96-4846-bb22-15745494f67f) | Tap-to-toggle attendance grid, bulk actions |
| 05-kayak-seat-map-states.png | [KAYAK seat select](https://mobbin.com/screens/053f64a0-54d1-487d-b004-ae683e661776) | Grid state communication with a legend |
| 06-posh-guestlist-checkin.png | [Posh guestlist](https://mobbin.com/screens/bfe31804-7823-49be-b096-f857aa7b638c) | Check-in table with status badges |
| 07-square-waitlist.png | [Square waitlist](https://mobbin.com/screens/7c5aa299-17db-4995-8640-f3afc08a5c4b) | The queue table baseline to beat |
| 08-lyssna-session-cards.png | [Lyssna sessions](https://mobbin.com/screens/a0775aa3-ba76-46fd-a1cb-c4cabc9a1dbb) | Session cards, next-session banner |
| 09-honeybook-session-setup.png | [HoneyBook scheduler](https://mobbin.com/screens/856027ca-065d-4a8f-91e3-ab6f6f4de63b) | Setup-as-cards with toggles |
| 10-oura-elapsed-timer.png | [Oura workout timer](https://mobbin.com/screens/242a57a8-f0de-4669-a9a6-4d7d46e0582c) | Giant quiet numerals |
| 11-equinox-place-in-line.png | [Equinox+ place in line](https://mobbin.com/screens/175f19d0-617d-4275-8409-c0917628b1a4) | Queue position as one huge number |

## Anti-patterns

- Purple or blue-to-pink gradients, glassmorphism, glow.
- Colored buttons, colored icon tiles, decorative color of any kind.
- Dots or icons inside badges.
- Any transition or animation, including "tasteful" 150ms ones.
- Condensed athletic display type; loudness comes from size and weight in
  Geist, not from a display face.
- Emoji as icons. En or em dashes in any text.
