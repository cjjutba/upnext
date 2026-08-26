# upnext design system revision prompt (v2, light monochrome)

Date: 2026-08-26. Paste the block below into Claude Design as the revision
prompt for the existing upnext design system.

---

Revise the upnext design system. The product and screens stay the same: a
courtside pickleball open play manager PWA, three screens (roster and session
setup, live session board with courts and queue, session summary), landscape
tablet first, touch first. What changes is the visual system. These are hard
constraints. Enforce them in tokens, guideline cards, components, UI kits,
templates, the readme, and every line of copy.

1. Light mode only. Delete the dark theme entirely: no dark tokens, no
`data-theme` scope, no theme switcher. One `:root` block. Dark mode is a
future designed theme, not an inversion, and it is out of scope for v1.

2. Monochrome, Geist grade. Replace the entire palette (kill the lime accent
#C7F03C and the current status greens). The look is near-black on white,
premium and quiet, like the Vercel dashboard. Use this exact scale:

- Backgrounds: #ffffff canvas, #fafafa secondary surface.
- Gray scale: 100 #f2f2f2, 200 #ebebeb, 300 #e6e6e6, 500 #c9c9c9,
  600 #a8a8a8, 700 #8f8f8f, 900 #4d4d4d, 1000 #171717.
- Borders come from black alpha, not gray fills: default #00000014, hover
  #00000036, active #0000003d. Structure is 1px borders, never shadows on
  cards. Shadows exist only on menus (0 4px 12px rgba(0,0,0,0.10)) and
  modals (0 16px 48px rgba(0,0,0,0.16)).
- Text: #171717 primary, #4d4d4d secondary, #8f8f8f tertiary.
- Interactive elements are monochrome. Primary button is a solid #171717
  fill with white text, #383838 on press. Secondary is white with an alpha
  border. Never a colored button.
- Blue #006bff exists only as a state signal: focus rings and text links.
  Nothing else is blue. The next-four queue highlight is monochrome: gray
  100 row fill with a 2px #171717 left bar and a "Next up" label.
- Status hues are muted and appear only inside status badges:
  green #45a557 family, amber #ffb224 family, red #e5484d family.
  95 percent of any screen must survive grayscale.

3. Badges are text only. No dots, no circles, no icons inside any badge,
ever. A status badge is a pill (radius 9999) with the word alone: "Live",
"Running long", "Closed", "Sitting out". Style: 13px medium, sentence case,
tinted background with dark text of the same hue (green example: #effbef
background, #297a3a text; amber: #fff6e5 and #a35200; red: #ffeeef and
#c33236; neutral: #f2f2f2 and #4d4d4d). The word is the signal, so color is
never the only carrier. Update the StatusBadge component, every guideline
card, and every screen that shows the dot pattern.

4. No motion. Zero animations and zero transitions anywhere: no easing
tokens, no durations, no scale on press, no slide when a court refills, no
shimmer on skeletons. Delete motion.css and the motion guideline card.
State changes are instant. Feedback comes from instant state swaps: press
moves the background or border one scale step with no transition. The
product must feel fast and snappy because nothing ever waits.

5. No en dashes and no em dashes anywhere: copy, labels, docs, code,
comments, token names. Use a comma, a colon, a period, or the word "to" for
ranges ("64 to 96px"). Audit existing copy for both characters and remove
them.

6. Typography: Geist Sans and Geist Mono (Google Fonts), replacing Barlow,
Barlow Condensed, and IBM Plex Mono everywhere. Geist Sans 400/500/600, max
two weights per view, negative tracking at large sizes, 14px UI workhorse,
16px body floor on touch surfaces, sentence case everywhere. Geist Mono
with tabular numerals for every timer, clock, count, position, and stat
column so digits never shift layout. Court timers stay huge, 64 to 96px,
Geist Mono 500. Court numbers and player names are Geist Sans 600 with
tight tracking, not condensed display type. The wordmark is the word
"upnext" lowercase in Geist Sans 600; there is no logo.

7. Unchanged, and still enforced: Lucide icons only (1.5px stroke, one
style, always labeled except close, back, and overflow), 8pt spacing grid,
flat solid fills with no gradients, no glassmorphism, no purple, no emoji.
Radii align to the Geist scale: 6px controls, 8px cards, 12px modals,
9999px pills. Touch targets 48px minimum and primary actions 56px or more:
this is still a tablet product used by someone holding a paddle. Voice
stays terse and operational, verbs first, no exclamation points.

Rebuild the guideline cards, components, and the three UI kit screens to
match. The result should read as courtside equipment built by the Vercel
design team: white, precise, instant.

---

## Why these exact values

Every hex above is lifted from CJ's Geist-Grade Design System export
(Downloads/Geist-Grade Design System, tokens/colors.css and readme.md), so
upnext v1 inherits that system's logic instead of inventing a parallel
monochrome: same scale jobs (100 to 300 backgrounds, alpha borders, 700 to
800 fills, 900 secondary text, 1000 primary text), same two pillars
(monochrome interactive layer; structure from borders, not shadows), same
badge tinting (hue 100 background with hue 900 text).
