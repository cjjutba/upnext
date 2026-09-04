# Decisions

Why the code is shaped this way. Each entry is the decision, the reason, and
what it costs you. Sourced from code comments, the specs, and the git history.

## 1. Event sourcing instead of stored state

A session is an append-only log, and `SessionState` exists only as the result
of `replay()`.

Cloud sync is a v2 concern, and the shape it needs is an event upload. Storing
derived state instead would mean rewriting the persistence layer to get there.
Undo, crash recovery, resume, and device handoff all fall out of the same
mechanism rather than needing four separate features.

The cost: every state change has to be expressible as an event, and replay
runs over the whole log on every change. For a three-hour session on one
device that is nothing.

## 2. ULID ids as the canonical order

Replay sorts by `id` ascending. Ids come from a monotonic ULID factory, so
they are globally unique and time sortable.

Sorting by `ts` would break on a clock change and tie on same-millisecond
events. Sorting by `seq` works on one device and falls apart across two.
`[sessionId+seq]` exists in the schema, unused, waiting for sync.

## 3. No sessions table

The compound `[type+sessionId]` index answers "what sessions exist" by pulling
`session-started` and `session-ended` rows. The index is the sessions table.

A real table would be a second source of truth about something the log already
knows, and it would need to be kept correct on undo. History renders without
replaying anything.

## 4. Undo is an event, not a delete

`event-undone { targetEventId }` makes replay skip the target. The log stays
append-only and the audit trail stays complete.

Redo needs no extra machinery: an `event-undone` pointing at another
`event-undone` cancels it and reinstates the original. One recursive
definition in `computeSkipped()` covers both directions.

The cost: `computeSkipped()` runs on every replay, and a malformed cycle in an
imported log would recurse forever without the seed-as-false guard.

## 5. One promise queue in useSession

Every log mutation goes through a single serialized queue. Commit `76b230f`.

Two fast taps could otherwise merge events into memory in an order that
differs from the ULID order a reload would replay, and a double tap on undo
could target the same event twice, which breaks the redo chain. Both cases are
pinned by tests in `src/state/useSession.test.tsx`.

This is a courtside app used by someone in a hurry. Double taps are the normal
case, not the edge case.

## 6. Commands simulate their own events

`simulate()` in `src/domain/commands.ts` runs an event through `applyEvent`
with a throwaway envelope, so a command can see the state its first event
produces and decide what follows.

A check-in that brings the queue to four has to know the player is queued
before it can decide to fill a court. The alternative is duplicating reducer
logic inside the command layer, which would drift.

The sim envelopes never escape the module, which is what makes the
module-level counter behind them acceptable.

## 7. Rotation derives from games played together

The tie-break rotation in `pickPairing()` and `freshFill()` uses
`gamesTogether(state, four)`, not the session-global `pairingCycle`. Commit
`c2db7ef`.

This was a bug fix. Any non-winners finish bumps `pairingCycle`, so a pairing
computed for the Up next preview could differ from the fill moments later, on
a different court. The count of finished games that exact four have played
together is identical before and after an unrelated finish, so the preview
always equals the fill it promises.

`pairingCycle` is still incremented for event compatibility and read by
nothing.

## 8. The front four always play

A matching mode chooses among the three partitions of the front four eligible
players. It never chooses the players.

Rating-aware matching that reorders the queue would produce better games and
break the paddle-rack promise: longest waiting plays next. That promise is why
anyone trusts the app to run the night. A dedicated test in
`templates.test.ts` pins it, and the property suite re-checks it across all
five templates.

## 9. isWinnersTemplate as the single check

`isWinnersTemplate(t)` in `src/domain/types.ts`, used everywhere a winner
matters. Commit `62121d9`.

Four places had hand-rolled the check, and one of them used `!== 'all-off'` as
a proxy. When `balanced` and `social` were added, that proxy started refusing
one-tap finishes in both new modes. The named predicate makes the next mode
addition safe by default.

## 10. Timers derive from event timestamps

A court timer is `now - game.startedAt`, where `startedAt` is the `ts` of the
`game-started` event.

Resume replays it exactly, with no separate timer state to restore. The
tradeoff, accepted knowingly: an OS clock change mid-session makes the display
jump.

## 11. Light mode, monochrome, zero motion

The v1 brief started as dark-first with a lime accent and 150 to 250ms
transitions. All three were dropped.

The lime read generic. The dark default became one light theme, on the
argument that dark mode deserves to be designed rather than inverted. Motion
went because the product should feel instant, and a court restaging with a
150ms slide is 150ms of an organizer waiting.

## 12. Sitting out freezes the queue spot

A sitting-out player keeps their position and the game-former skips them until
they return.

This is deliberately generous. It works for bathroom breaks and technically
rewards a twenty-minute wander. The always-visible games-played count is the
correction, socially rather than mechanically. Enforcing it in code would mean
guessing at intent.

## 13. Invalid events no-op instead of throwing

Every case in `applyEvent` returns the state unchanged when a guard fails, and
the switch has a `default` that does the same.

The UI already prevents these, so this is not the primary defense. It is there
so a log imported from another device, or written by a newer build with an
event type this one has never seen, degrades instead of crashing. A v1 build
reading a v1.1 log skips `court-added` and keeps working.

## 14. Staging is automatic, starting is not

Filling a court and starting its clock used to be one event. Tapping "Team 1
wins" ended the game and started the next one in the same batch, so the timer
was running before anyone had walked over.

They are now two events. `game-staged` still fires automatically, from every
command that frees capacity, because an organizer should never have to ask the
app who is next. `game-started` only comes from the Start button.

The gap between them is the whole point. It is where a wrong name gets fixed,
a substitute gets swapped in, and the four get called over. Splitting it also
made the court call honest: it speaks when people should actually walk on,
rather than when the software decided a game existed.

The cost is one more tap per game. That was judged cheaper than a clock that
starts on an empty court.

## 15. Staged is a field, not a flag on the game

`SessionState` carries `staged: Record<number, Pairs>` alongside `games`,
rather than a `status` on `ActiveGame`.

`isPlaying()`, `standings.ts`, `pairHistory()`, and the summary all iterate
`state.games` and assume the clock is running. A flag would have put a check in
every one of them, and the first one anybody forgot would have counted a game
that never happened. A separate record leaves all of them correct without an
edit.

Staged players leave the queue, exactly like players in a live game, so the
conservation invariant stays sharp: a checked-in player is in exactly one of
three places. The cost is that `player-departed` and `player-sat-out` refuse a
staged player, so those commands pull them back into the queue first. The
guards enforcing that is a feature: a stale staged entry can never appear.

## 16. Standings rank on a weighted rate, then a cascade

The table sorted on wins, then win rate, then games played. Three players at six
and zero came out as three number ones, which is not a standing.

Ranking now runs a cascade. The sort key is the win rate with one notional win
and one notional loss folded in, so a single game at 100 percent cannot outrank
six of them. Whoever is still level gets split on head to head, then point
margin, then the mean win rate of the opponents they faced, then their longest
run of wins. Each key only reorders inside a group the key above it left tied,
so a later key can never overturn an earlier one.

A key that splits a group sends every part back to the top of the cascade, the
way a league table re-applies its tiebreaks. Head to head across four players is
a sum over the whole group, and it can come out level for two of them who did in
fact play each other. Once those two are alone, that meeting is the answer.

Three rules hold the shape. A player with no decided game ranks below everyone
who has one, however badly it went. Point margin sits out unless every player
still tied recorded a score, and it averages per scored game, because how many
scores the organizer typed is not a result. An opponent counts at their win rate
over everyone else, so beating the same player five times does not make that
player look weak and pull your own tiebreak down with them.

Anyone who survives all of it is genuinely level and still shares a rank. Before
the first winner, that is everybody.

The cost: the order can move for a reason the columns do not show, so the row
carries the name of the tiebreak that placed it.

## 17. The winner is a tap, and no screen records a score

Ending a match used to mean typing two numbers. The button under the court read
"Enter the score" until both were filled, then flipped to "Team 1 wins". Two
problems came out of that. The organizer is courtside with a paddle in one hand
and four people waiting to rotate on, and two numeric fields is not a gesture
that fits. Worse, a match nobody kept score of could not be ended at all, which
is most of them.

A live court now shows two buttons, Team 1 wins and Team 2 wins, one under each
half of the diagram. The left button is under team 1 because team 1 is drawn on
the left, and the diagram right above it is already carrying the four names, so
repeating them on the buttons only makes the label longer and breakable by a
long name. One tap finishes the game and stages the next four. Nothing confirms
it: the undo pill is the safety net, and it names the court.

Score entry is gone, not moved. It was built back as an optional row of chips
for the losing team behind a Track scores switch, and cut on sight: an open play
night does not want a second thing to tap, and a control that is off by default
and useless when on is not worth the header space. Rec play is win and loss.

`game-finished` keeps its optional `score` and `finishGame()` still accepts one.
Dropping the field would change the meaning of an event type, and rule 6 does
not allow that. An imported log with scores still feeds the point margin key in
decision 16. A session played on this build never will, so that key sits out,
which it was already written to do whenever a tied player had no scored game.
