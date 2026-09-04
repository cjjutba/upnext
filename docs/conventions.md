# Conventions

Design rules, code patterns, and what running the tests is supposed to prove.
The visual reasoning behind the rules is in `design/claude-design-brief.md`.

## Design rules

Check a UI diff against this list. Every line is a hard rule, not a
preference.

| Rule | Detail |
|---|---|
| Light mode only | One `:root` block. No dark tokens, no theme switcher. Dark mode would be a designed theme, never an inversion |
| Monochrome interactive layer | Primary buttons are solid `#171717` with white text. One exception: a destructive action is solid `--danger` red, and End session is the only one. Never a colored icon tile |
| Structure from borders | 1px black-alpha borders, not shadows. Shadows exist only on menus and modals |
| Blue is a state signal | `#006bff` for focus rings and text links. Nothing else. Court state is carried by a text badge, never by a hue |
| Text-only badges | A pill with the word alone. No dots, no circles, no icons, ever. Tinted background, dark same-hue text |
| Near-zero motion | One exception: the check-in rail slides on collapse, 180ms, skipped under `prefers-reduced-motion`. Otherwise no transitions, no easing, no press scale, no shimmer. Press feedback is an instant one-step background or border change |
| The court is the graphic | A four on a court is drawn on `CourtDiagram`, live or staged or merely next up. The queue section under the courts uses the same graphic on purpose |
| Type | Geist Sans 400/500/600 and Geist Mono. Mono with tabular numerals for every timer, count, position, and stat column, so digits never shift layout |
| Radii | 6px controls, 8px cards, 12px modals, 9999px pills |
| Spacing | 8pt grid via the `--space-*` tokens |
| Touch targets | 48px minimum, 56px or more for primary actions. Someone is holding a paddle in the other hand |
| Icons | Lucide only, 1.5px stroke, labeled except close, back, and overflow |
| Flat fills | No gradients, no glassmorphism, no glow, no purple, no emoji |
| No dashes | No en dashes and no em dashes in copy, code, comments, commits, or docs. Use a comma, a period, or "to" for ranges |

Roughly all of any screen should survive being converted to grayscale. If a
change fails that, the color is carrying meaning it should not.

## Tokens

`src/styles/tokens.css` is the source. Never hardcode a hex in a component.

| Group | Tokens |
|---|---|
| Surfaces | `--bg`, `--bg-secondary` |
| Grays | `--gray-100` through `--gray-1000` |
| Borders | `--border`, `--border-hover`, `--border-active`, all black alpha |
| Text | `--text`, `--text-secondary`, `--text-tertiary` |
| Interactive | `--primary`, `--primary-press`, `--primary-fg` |
| Destructive | `--danger`, `--danger-press`, `--danger-fg` |
| Signals | `--blue`, `--focus-ring` |
| Elevation | `--shadow-menu`, `--shadow-modal` |
| Status | `--status-{green,amber,red,neutral}-{bg,text}` |
| Type | `--font-sans`, `--font-mono`, ten size tokens, `--tracking-tight` |
| Layout | `--space-1` to `--space-6`, four radii, `--tap-min`, `--tap-primary` |

## Styling

Inline `style={{}}` reading `var(--token)`. No CSS modules, no Tailwind, no
styled-components, no `.css` file per component.

`src/styles/base.css` holds the reset and four utility classes, used through
`className`:

| Class | For |
|---|---|
| `.mono` | Geist Mono, tabular numerals. Every number that could shift layout |
| `.display` | Geist Sans 600, tight tracking. Names, court numbers, headings |
| `.micro-label` | 13px medium, tertiary color. Section labels |
| `.timer` | Same as `.mono`. Kept for timer markup |

## Component patterns

Copy these rather than inventing a parallel approach.

- **Pressed state** is `useState` plus `onPointerDown`, `onPointerUp`,
  `onPointerLeave`, and `onPointerCancel`, swapping a background or border
  token with no transition. See `src/components/Button.tsx`.
- **Icons** come only from `src/components/Icon.tsx`. Add the Lucide import
  to the `icons` map first, which makes the name available through the
  `IconName` type. Never import from `lucide-react` in a component.
- **Labels** on icon-only or ambiguous controls use the `ariaLabel` prop.
  Selectable controls carry `aria-pressed`.
- **Props in, callbacks out.** A component in `src/components` never imports
  a command, never touches Dexie, and holds no session state.

## Testing

All correctness risk lives in the reducer and the templates, and both are pure
functions. 238 cases across 12 files.

| File | Covers |
|---|---|
| `src/domain/reducer.test.ts` | Every event type, guards, no-op paths, undo chains |
| `src/domain/templates.test.ts` | Pairing selection per mode, fairness, rotation |
| `src/domain/commands.test.ts` | Command output, auto-staging, starting, substitutions, refusals, undo targeting |
| `src/domain/invariants.test.ts` | fast-check property suite |
| `src/db/eventStore.test.ts` | Append, ordering, listing, export and import |
| `src/state/useSession.test.tsx` | Dispatch, undo, redo, concurrent taps |
| `src/lib/ids.test.ts` | ULID ordering, stable device id |
| `src/domain/announce.test.ts` | Phrase builders and what a batch reads aloud |
| `src/domain/standings.test.ts` | The ranking cascade, every tiebreak, shared ranks, win rate |
| `src/state/useAnnouncer.test.tsx` | Which batches speak and which stay silent |
| `src/App.test.tsx` | The board driven end to end: staging, starting, calls, crowd operations, mode switches |
| `src/domain/modes.test.ts` | Mode metadata, and that every template has a label |

Shared helpers, worth reusing:

- `ev()` in `reducer.test.ts` builds an event with a zero-padded id, so string
  order matches creation order.
- `seal()` in `commands.test.ts` and `invariants.test.ts` gives command output
  real-looking envelopes so `replay()` can consume it.
- `state()` in `templates.test.ts` builds a started `SessionState` from a
  partial.
- `eventStore.test.ts` builds a fresh `UpnextDB` per test with a unique name.
  `src/test-setup.ts` loads `fake-indexeddb/auto` and jest-dom matchers.

### Unit test or property test

Write a unit test when you know the expected output: this queue plus this mode
produces these pairs.

Add to the property suite when you want an invariant to hold across sequences
you did not think of. `invariants.test.ts` drives random command sequences
through the real command layer and asserts things that must never be false:

- No player is on two courts at once.
- An occupied court holds at most four players, never the same one twice.
- The queue and the courts are disjoint.
- Every checked-in, non-departed player is in exactly one place.
- Sitting-out players keep a queue spot.
- Nobody is staged on two courts, and no court is staged and live at once.
- Closed courts are never occupied and never exceed `courtCount`.
- Replay is deterministic, and undo then redo restores the exact state.

Any new mode belongs in the `template` arbitrary. A counterexample from this
suite is a real bug, so reproduce it before changing anything.

## Commits

Conventional prefixes, lowercase, no scope, matching the existing log:

```
feat: add matching mode picker, bulk check-in, returning players, player editor
fix: derive pairing rotation from shared games so previews match fills
docs: record the rotation source correction in the plan
test: extend property coverage to new modes and finish v1.1 verification
```

One commit per finished task, with tests green at each one.

## Verification

```bash
npm test
npm run typecheck
npm run build
grep -rnP '[\x{2013}\x{2014}]' src docs *.md index.html && echo FOUND || echo CLEAN
```

For UI work, also run the real app and drive the flow. Offline behavior only
shows up in a production build, so use `npm run build && npm run preview` and
reload with the network off.
