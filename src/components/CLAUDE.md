# src/components

Presentational only. Props in, callbacks out.

## Rules

- **No Dexie, no commands, no session state.** A component takes what it needs
  as props and reports back through callbacks. The only domain imports allowed
  are types and `modes.ts`.
- **Use shared classes and tokens.** Styles live in `src/styles`. Read colors
  and spacings from tokens and keep state-dependent values inline.
- **Zero motion in this directory.** No `transition`, no `animation`, no
  transform on press. Press feedback is an instant token swap. Reuse
  `Button.tsx` and `IconButton.tsx`. The one
  animation in the app is the rail collapse, and it lives in
  `src/screens/SessionBoard.tsx`, not here.
- **Icons only through `Icon.tsx`.** Add the Lucide import to the `icons` map
  first, which makes the name valid on the `IconName` type. Never import from
  `lucide-react` directly.
- **48px minimum touch target**, 56px or more for a primary action. Use
  `var(--tap-min)` and `var(--tap-primary)`.
- **Accessibility.** `ariaLabel` on icon-only or ambiguous controls,
  `aria-pressed` on selectable ones, `aria-hidden` on decorative SVG.
- **Badges are text only.** No dots, no icons inside a badge, ever.
- **No en dashes or em dashes** in any label or comment.

Full design checklist: `docs/conventions.md`.
