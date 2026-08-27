# docs

What is in here and how much to trust it.

## Canonical

Written against the shipped code and kept current. Start here.

| File | Covers |
|---|---|
| `../AGENTS.md` | The entry point. Loop, layers, rules, recipes |
| `architecture.md` | Layer boundaries, per-file map, the command layer |
| `event-model.md` | All 14 event types, state shape, queue rules, undo, Dexie schema |
| `conventions.md` | Design rules as a diff checklist, styling and testing patterns |
| `decisions.md` | Why the code is shaped this way |

## Visual contract

Still authoritative for anything the eye sees. Predates the code but has not
drifted, because the code was built to it.

| File | Covers |
|---|---|
| `design/claude-design-brief.md` | The direction, hard rules, anti-patterns, reference shots |
| `design/claude-design-prompt-v2.md` | Exact token values and the reasoning behind each |
| `design/references/` | 11 Mobbin screenshots. Structure only. Ignore their palettes |

## Historical

Accurate when written, partly superseded since. Useful for intent, unreliable
for detail.

| File | Status |
|---|---|
| `superpowers/specs/2026-08-26-upnext-open-play-design.md` | v1 design spec. See drift below |
| `superpowers/specs/2026-08-27-upnext-v1.1-design.md` | v1.1 delta spec. Largely accurate |
| `superpowers/plans/2026-08-27-upnext-v1.md` | Executed plan, 3,300 lines. Not instructions |
| `superpowers/plans/2026-08-27-upnext-v1.1.md` | Executed plan, 1,100 lines. Not instructions |

## Known drift

Places where a document says one thing and the code does another. The code
wins.

| The document says | The code does |
|---|---|
| `deviceId` is stored in Dexie (v1 spec) | `localStorage` under `upnext-device-id`, in `../src/lib/ids.ts` |
| State sits behind `useReducer` or Zustand (v1 spec) | `useState` plus `useMemo(replay)` in `../src/state/useSession.ts` |
| The reducer upgrades old events on read (v1 spec) | It does not. `v` is always 1 and nothing reads it yet |
| Pairing rotation comes from `pairingCycle` (both plans) | It comes from `gamesTogether()` in `../src/domain/templates.ts`. `pairingCycle` is still incremented for event compatibility and read by nothing |
| Players carry a free-form `level` tag (v1 spec) | `level` is on the type and unused. Star `rating` replaced it |
| Three rotation templates (v1 spec) | Five template ids behind four user-facing modes |

Two things no document mentioned before now: the `meta` Dexie table, which
holds the per-device `seq` counter, and the fact that `.oxlintrc.json` has no
matching `npm` script.
