# upnext design system brief

Date: 2026-08-26
Purpose: everything needed to set up the upnext design system in Claude Design
(claude.ai/design), grounded in real reference UI pulled from Mobbin.

## The one-line direction

Broadcast scoreboard minimalism: a dark, calm operations surface with one loud
optic-lime accent, condensed athletic type for names and numbers, and giant
tabular timers. It should feel like courtside equipment, not a SaaS dashboard.

## Paste into "Company name and blurb"

> upnext: a courtside pickleball open play manager. An offline-first web app
> (PWA) that one organizer uses on a tablet to run open play nights: check
> players in, manage the paddle queue, form games of four, assign courts,
> track live game timers, and rotate players by house rules (all four off,
> winners stay, winners split). Three screens: roster and session setup, the
> live session board (courts + queue), and session summary.

## Paste into "Any other notes"

> Design direction: broadcast scoreboard minimalism. Dark theme is the
> default (gyms, evening play); a full light theme exists for outdoor daytime
> use. Near-black neutral surfaces (#0B0D0E background, #141719 cards, 1px
> #262B2F borders, radius 10px, flat, no shadows in dark mode), one accent
> only: optic lime #C7F03C, always as a fill or ring with near-black text on
> it, never as body text on dark. Status colors are semantic and always
> paired with a text label: green = live game, amber = game running long,
> red = court closed. No gradients, no glassmorphism, no purple, no emoji as
> icons (Lucide icons, 1.5px stroke, 24px grid).
>
> Typography: Barlow Condensed SemiBold for headings, player names on cards,
> and court numbers; Barlow for body and UI; IBM Plex Mono Medium with
> tabular figures for every timer, clock, count, and stat column so digits
> never shift layout. Timers are huge (64 to 96px), court numbers 32 to 40px,
> body 16px minimum.
>
> Ergonomics: this is used one-handed by someone holding a paddle, on a
> tablet in landscape propped courtside, often in glare. Touch targets 48px
> minimum, primary actions 56px or more, generous spacing on an 8pt grid,
> one primary action per card, high contrast (WCAG AA in both themes),
> visible pressed states within 100ms. Data-dense but scannable, like a
> flight departures board: a player should read the queue from two meters
> away.

## Design tokens

### Color, dark theme (default)

| Token | Hex | Use |
|---|---|---|
| bg | #0B0D0E | App background |
| surface | #141719 | Cards: courts, queue rows |
| surface-raised | #1C2023 | Modals, sheets, active states |
| border | #262B2F | 1px card and divider lines |
| text | #F4F6F5 | Primary text |
| text-muted | #9BA3A7 | Labels, secondary text |
| accent | #C7F03C | The single brand accent: primary buttons, active court ring, selection. Always with #0B0D0E text on it |
| accent-tint | #C7F03C at 12% | Selected row and chip backgrounds |
| live | #4ADE80 | Game in progress indicator |
| warn | #FBBF24 | Game running long, cap warnings |
| danger | #F87171 | Court closed, destructive actions |

### Color, light theme

| Token | Hex | Use |
|---|---|---|
| bg | #F7F8F7 | App background |
| surface | #FFFFFF | Cards, with subtle elevation shadow allowed |
| border | #E3E6E4 | Lines |
| text | #16181A | Primary text |
| text-muted | #5A6165 | Secondary text |
| accent fill | #C7F03C | Same lime fills with #16181A text |
| accent text/link | #4D6B12 | Accent as text, meets 4.5:1 on white |
| live / warn / danger | #16A34A / #D97706 / #DC2626 | Saturated variants for light surfaces |

### Typography

| Role | Face | Size |
|---|---|---|
| Timers, clocks, counts, stat columns | IBM Plex Mono Medium, tabular | 64 to 96px timers, 16 to 20px inline |
| Headings, player names on cards, court numbers | Barlow Condensed SemiBold/Bold | Court numbers 32 to 40px, headings 20 to 28px |
| Body, buttons, forms, queue rows | Barlow Regular/Medium/SemiBold | 16px body minimum, 18px queue rows |

Google Fonts: `Barlow Condensed` (600, 700), `Barlow` (400, 500, 600),
`IBM Plex Mono` (500).

### Shape, spacing, motion

- 8pt spacing grid, 4pt only inside compact chips.
- Radius: 10px cards, 8px buttons and inputs, full round for count badges and
  player chips.
- Dark mode is flat: hierarchy from surface steps and 1px borders, not
  shadows. Light mode may use one soft elevation level for cards.
- Motion: 150 to 250ms, ease-out in, ease-in out, transform and opacity only.
  A court refilling animates the incoming pair sliding up from the queue.
  Respect prefers-reduced-motion.
- Icons: Lucide, 1.5px stroke, one style everywhere, always paired with a
  label except universally understood controls (close, back).

## Screens to design (in priority order)

1. **Live session board** (the product). Court cards in a responsive grid on
   top: court number, the two pairs stacked as "A + B vs C + D", huge elapsed
   timer, live status dot, one primary tap area to finish the game
   (template-driven: one tap under all four off, tap the winning pair under
   winners stay/split), overflow menu for lineup edit, partner swap, close
   court. Below or beside: the numbered queue, 18px rows with games-played
   count and sit-out toggle, next-four highlighted with the accent tint, and
   a check-in tap grid of roster names sorted by recent frequency. Prominent
   undo pill, always visible. Session clock in the header.
2. **Roster and session setup.** Player management list, and a setup card:
   court count stepper, rule template picker (three big option cards with
   one-line rule explanations), win cap stepper when relevant, big Start
   session button. Session history list below.
3. **Session summary.** Stat table per player (games, wins where tracked),
   session length, biggest court time, share/export action.

## Reference shots (docs/design/references/)

Pulled from Mobbin 2026-08-26. Each file name says what to take from it.

| File | Source | Take this |
|---|---|---|
| 01-thescore-court-lineup.png | [theScore lineups](https://mobbin.com/screens/8df66e45-a10c-44e0-9088-e05a26d134bd) | Dark sports surface; player chips arranged on a stylized field. The court card can echo this: pairs positioned on a minimal court outline |
| 02-riot-match-details.png | [Riot Mobile match details](https://mobbin.com/screens/272f910f-30ff-4080-b7d9-62c0e83d4780) | Dark team roster with per-player stat columns; the session summary's shape |
| 03-nba-box-score.png | [NBA box score](https://mobbin.com/screens/cebf4f9b-db58-46a7-840f-cff431fb1cfc) | Dense, scannable stat table typography |
| 04-classdojo-attendance-grid.png | [ClassDojo attendance](https://mobbin.com/screens/3f1f396d-ab96-4846-bb22-15745494f67f) | Tap a person to toggle attendance, bulk actions bottom bar; the check-in grid's interaction model |
| 05-kayak-seat-map-states.png | [KAYAK seat select](https://mobbin.com/screens/053f64a0-54d1-487d-b004-ae683e661776) | A grid where color + legend communicate state; how the tap grid shows checked-in / playing / sitting-out |
| 06-posh-guestlist-checkin.png | [Posh guestlist](https://mobbin.com/screens/bfe31804-7823-49be-b096-f857aa7b638c) | Dark table with green "Checked In" status badges; closest existing aesthetic to upnext's dark theme |
| 07-square-waitlist.png | [Square waitlist](https://mobbin.com/screens/7c5aa299-17db-4995-8640-f3afc08a5c4b) | The plain queue table baseline; what upnext must beat on glanceability |
| 08-lyssna-session-cards.png | [Lyssna sessions](https://mobbin.com/screens/a0775aa3-ba76-46fd-a1cb-c4cabc9a1dbb) | Session cards with a "next session" banner; session history layout |
| 09-honeybook-session-setup.png | [HoneyBook scheduler](https://mobbin.com/screens/856027ca-065d-4a8f-91e3-ab6f6f4de63b) | Setup-as-cards with toggles; the session setup screen's shape |
| 10-oura-elapsed-timer.png | [Oura workout timer](https://mobbin.com/screens/242a57a8-f0de-4669-a9a6-4d7d46e0582c) | Giant quiet numerals on a dark surface; the court timer's typography |
| 11-equinox-place-in-line.png | [Equinox+ place in line](https://mobbin.com/screens/175f19d0-617d-4275-8409-c0917628b1a4) | A queue position as one huge number; the "you're up next" moment |

## Anti-patterns (what generic AI design would do here, and we will not)

- Purple/indigo gradients, glassmorphism, glow effects.
- Inter-on-slate-900 default dashboard look with shadcn card soup.
- Emoji as icons, decorative emoji in headings.
- Equal visual weight everywhere: on the live board the timers and the next
  four in the queue are loud, everything else is quiet.
- Proportional-figure timers that make digits jitter.
- Tiny hover-dependent controls; everything here is a thumb tap.
