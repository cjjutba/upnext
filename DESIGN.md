# Upnext courtside design

Upnext is used by the organizer holding the only device at a pickleball session. The landing page shows how open play and tournament scoring work. Inside the app, a court's state and next action should be readable in a glance.

| Element | Design |
|---|---|
| Canvas | Warm off-white `#F6F8F2`. Raised working panels use a slightly lighter fill and a single border. |
| Text | Ink `#152F2A`. Geist Sans is stored with the app. Timers, scores, ranks, and counts use tabular digits. |
| Actions | Court teal `#006B60` for primary buttons, focus, and links. Keep secondary actions quiet and confirmed destructive actions red. |
| Queue | Pickleball lime `#D7F464` marks the first waiting match. |
| Status | Use a word and a muted tint. Court labels are Live, Ready to start, and Open. Tournament results retain explicit qualification, forfeit, provisional, and tied states. |
| Shape | 9px controls, 15px cards, 19px dialogs. Keep touch targets at least 48px and primary actions at least 56px. |

The landing is a script-free Vite entry. It shares the court diagram and tokens with the operator app. Open play puts live court controls before the full queue and shows the first waiting lineup above the courts. On narrow screens the check-in rail stacks below the board. Tournament setup groups event details, the shared roster, and division rules. During play, match context, both team scores, and the effect of corrections stay visible where the organizer acts.

The check-in rail is the only animated control. It stops moving under Reduce Motion. Keep font, app icons, and court art local. The Geist license is at `public/fonts/Geist-OFL.txt`.

See `docs/conventions.md` for interaction, implementation, and test details.
