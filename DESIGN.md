# Upnext courtside design

Upnext is used by the organizer holding the only device at a pickleball session. The landing page shows how open play and tournament scoring work. Inside the app, a court's state and next action should be readable in a glance.

| Element | Design |
|---|---|
| Canvas | Cool slate `#F6F8FC` behind white working panels. The landing board and tournament masthead use deep navy. |
| Text | Navy ink `#14243D`. Geist Sans is stored with the app. Timers, scores, ranks, and counts use tabular digits. |
| Actions | Blue `#2769EE` for primary, raised outlined white for secondary, red for destructive, and flat ghost for utility actions. Landing links and app buttons use `src/styles/actions.css`. The slight sheen keeps enabled white labels at or above 4.5:1. |
| Queue | A pale blue label marks Up next. The shared court graphic uses blue playing zones and white lines. |
| Status | Use a word and a muted tint. Blue also marks current navigation and selected choices. Keyboard focus uses a slate outline, or white on the court. Court labels are Live, Ready to start, and Open. Tournament results retain explicit qualification, forfeit, provisional, and tied states. |
| Shape | 6px controls, 15px cards, 19px dialogs. Keep touch targets at least 48px and primary actions at least 56px. |

The landing is a script-free Vite entry. It shares the court diagram and tokens with the operator app. Open play puts live court controls before the full queue and shows the first waiting lineup above the courts. On narrow screens the check-in rail stacks below the board, and Undo and Redo sit above the courts in the page flow. Tournament setup groups event details, the shared roster, and division rules. During play, match context, both team scores, and the effect of corrections stay visible where the organizer acts.

The check-in rail is the only animated control. It stops moving under Reduce Motion. Keep font, app icons, and court art local. The Geist license is at `public/fonts/Geist-OFL.txt`.

See `docs/conventions.md` for interaction, implementation, and test details.
