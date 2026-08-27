import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor, within, cleanup, fireEvent, act } from '@testing-library/react';
import App from './App';
import { db } from './db/db';

/** Records every utterance the app hands the browser, in queue order. */
const spoken: string[] = [];

class FakeUtterance {
  text: string;
  voice: unknown = null;
  lang = '';
  volume = 1;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeechStub() {
  spoken.length = 0;
  const synth = {
    paused: false,
    speaking: false,
    speak: (u: FakeUtterance) => {
      if (u.volume !== 0) spoken.push(u.text); // volume 0 is the silent iOS unlock utterance
    },
    cancel: () => spoken.push('[cancel]'),
    resume: () => {},
    getVoices: () => [],
    addEventListener: () => {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  (globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance;
}

/** Everything the app said, minus the cancel markers. */
const said = () => spoken.filter((s) => s !== '[cancel]');

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Henry'];

async function reset() {
  await db.players.clear();
  await db.sessionEvents.clear();
  await db.meta.clear();
  window.location.hash = '';
  window.localStorage.clear();
  const now = Date.now();
  await db.players.bulkPut(NAMES.map((name, i) => ({ id: `p-${i}`, name, createdAt: now + i, updatedAt: now + i })));
}

const click = (el: Element) => act(() => { fireEvent.click(el); });

const btn = (name: string | RegExp, scope: HTMLElement | null = null) =>
  (scope ? within(scope) : screen).getByRole('button', { name });

/**
 * Check in everyone, drop to one court, pick a mode, start. Leaves the board on
 * screen with court 1 staged: eight players in roster order pair Alice and
 * Carol against Bob and Dave, with Eve, Frank, Grace, and Henry waiting.
 */
async function openBoard(mode: RegExp) {
  await screen.findByText('Roster');
  await click(btn('Check in all'));
  await click(btn(mode));
  await click(btn('Courts down'));
  await click(btn(/Start session/));
  await screen.findByLabelText('Close court 1'); // board only: "Courts" also labels the setup stepper
}

/** Open the board and tap Start, which is the only thing that puts a clock on a court. */
async function startMatch(mode: RegExp) {
  await openBoard(mode);
  await click(btn('Start match on court 1'));
  await screen.findByLabelText('Team 1 wins on court 1'); // the dispatch is async; wait for the clock
}

/** The card div that owns a court's close button. */
const courtCard = (n: number) => screen.getByLabelText(`Close court ${n}`).closest('div')!.parentElement!;

/** The queue panel for the next four waiting. */
const upNext = () => screen.getByText('Up next').closest('div')!.parentElement!;

const chip = (name: string, scope: HTMLElement) => within(scope).getByRole('button', { name: `${name}, change or remove` });

/** The four names on a court graphic, in slot order: team 1 top and bottom, then team 2. */
const chipOrder = (scope: HTMLElement) =>
  within(scope).getAllByRole('button', { name: /, change or remove$/ })
    .map((b) => b.getAttribute('aria-label')!.replace(', change or remove', ''));

const dialog = (name: string | RegExp) => screen.getByRole('dialog', { name });

const openStandings = async () => {
  await click(btn('Live standings'));
  return screen.findByRole('dialog', { name: 'Live standings' });
};

describe('App: courtside calls, standings, and the mute switch', () => {
  beforeEach(async () => {
    installSpeechStub();
    await reset();
  });
  afterEach(cleanup);

  it('stages court 1 in silence, calls it on the Start tap, then reads the winner', async () => {
    render(<App />);
    await openBoard(/^Balanced/);

    // the four are on the court and the clock has not started, so nothing was said
    expect(within(courtCard(1)).getByText('Staged')).toBeInTheDocument();
    expect(within(courtCard(1)).getByText('Alice')).toBeInTheDocument();
    expect(said()).toEqual([]);

    await click(btn('Start match on court 1'));
    await waitFor(() => expect(said()).toHaveLength(1));
    expect(said()[0]).toBe('Court 1. Alice and Carol versus Bob and Dave. Please proceed to court 1.');
    expect(within(courtCard(1)).getByText('Live')).toBeInTheDocument();

    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(said()).toHaveLength(2));
    expect(said()[1]).toBe('Court 1. Alice and Carol win.');
    // the next four walk on and wait: staged again, nothing spoken about it
    await waitFor(() => expect(within(courtCard(1)).getByText('Staged')).toBeInTheDocument());
    expect(said()).toHaveLength(2);
  });

  it('records wins in Balanced mode and ranks them in the live standings', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    await click(btn(/Team 1 wins/, courtCard(1)));

    const dialog = await openStandings();
    expect(within(dialog).getByText('8 players')).toBeInTheDocument();
    // the winning pair sits at rank 1 on one win apiece; the losing pair is on zero
    await waitFor(() => expect(within(dialog).getAllByText('100%')).toHaveLength(2));
    expect(within(dialog).getAllByText('0%')).toHaveLength(2);

    await click(btn(/Read top 3/, dialog));
    expect(said().at(-1)).toContain('Live standings. In first place,');
  });

  it('mutes on the speaker tap, keeps the win, and holds the preference across a remount', async () => {
    const view = render(<App />);
    await startMatch(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1));

    await click(btn('Mute announcements'));
    expect(spoken.at(-1)).toBe('[cancel]'); // muting stops the sentence in flight

    await click(btn(/Team 1 wins/, courtCard(1)));
    const dialog = await openStandings();
    await waitFor(() => expect(within(dialog).getAllByText('100%')).toHaveLength(2)); // the win landed
    expect(said()).toHaveLength(1); // and nothing was said about it
    await click(btn('Close standings', dialog));

    view.unmount();
    render(<App />);
    await waitFor(() => expect(btn('Unmute announcements')).toBeInTheDocument());
    await click(btn('Unmute announcements'));
    expect(btn('Mute announcements')).toBeInTheDocument();
  });

  it('says nothing when a live session resumes, then speaks again on the next action', async () => {
    const view = render(<App />);
    await startMatch(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1));

    view.unmount();
    spoken.length = 0;
    render(<App />);
    await screen.findByLabelText('Close court 1'); // resumed straight onto the board
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(said()).toEqual([]);

    await click(btn(/Team 2 wins/, courtCard(1)));
    await waitFor(() => expect(said().length).toBeGreaterThan(0));
    expect(said()[0]).toMatch(/win\.$/);
  });

  it('reads the podium when the session ends, and ranks the summary', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(said()).toHaveLength(2));

    await click(btn('End session'));
    await screen.findByText('Session summary');
    await waitFor(() => expect(said().at(-1)).toContain('Session complete. In first place,'));
    expect(said().at(-1)).toContain('with 1 win from 1 game, 100 percent.');
    expect(screen.getByText('Final standings')).toBeInTheDocument();
    expect(screen.getByText('Win rate')).toBeInTheDocument();

    await click(btn(/Read podium/));
    expect(said().at(-1)).toContain('Session complete. In first place,');
  });

  it('calls the up next four only when the button is tapped', async () => {
    render(<App />);
    await openBoard(/^Balanced/);
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(said()).toEqual([]); // no timer call fires on its own any more

    await click(btn('Call players up next'));
    expect(said()).toEqual(['Get ready. Up next. Team one, Eve and Grace. Versus team two, Frank and Henry.']);

    await click(btn('Call players to court 1'));
    expect(said().at(-1)).toBe('Get ready. Court 1. Team one, Alice and Carol. Versus team two, Bob and Dave.');
  });

  it('says everything exactly once under StrictMode, which is how main.tsx mounts it', async () => {
    render(<StrictMode><App /></StrictMode>);
    await startMatch(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1)); // the court call, not two of them

    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(said()).toHaveLength(2));

    await click(btn('End session'));
    await screen.findByText('Session summary');
    await waitFor(() => expect(said()).toHaveLength(3));
    expect(said().filter((l) => l.startsWith('Session complete.'))).toHaveLength(1);
  });

  it('keeps the winners on court in Winners mode, staged rather than started', async () => {
    render(<App />);
    await startMatch(/^Winners/);
    await waitFor(() => expect(said()).toHaveLength(1));
    const winners = ['Alice', 'Carol'];

    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(within(courtCard(1)).getByText('Staged')).toBeInTheDocument());
    for (const name of winners) expect(within(courtCard(1)).getByText(name)).toBeInTheDocument();
    expect(within(courtCard(1)).queryByText('0:00')).not.toBeInTheDocument(); // no clock until Start
  });

  it('swaps a waiting player onto a staged court, keeping the slot', async () => {
    render(<App />);
    await openBoard(/^Balanced/);

    await click(chip('Dave', courtCard(1)));
    const d = dialog('Change Dave');
    expect(within(d).getByText('Court 1')).toBeInTheDocument();
    await click(btn('Eve', d));

    await waitFor(() => expect(within(courtCard(1)).getByText('Eve')).toBeInTheDocument());
    expect(within(courtCard(1)).queryByText('Dave')).not.toBeInTheDocument();
    expect(within(upNext()).getByText('Dave')).toBeInTheDocument(); // replaced players go to the queue front
  });

  it('removes a staged player from the session and pulls the next one in', async () => {
    render(<App />);
    await openBoard(/^Balanced/);

    await click(chip('Dave', courtCard(1)));
    await click(btn('Remove from session', dialog('Change Dave')));

    await waitFor(() => expect(within(courtCard(1)).getByText('Eve')).toBeInTheDocument());
    expect(within(courtCard(1)).queryByText('Dave')).not.toBeInTheDocument();
    // Eve came off the queue to take the slot and Dave left the session, so three are waiting
    expect(screen.getByText('3 waiting')).toBeInTheDocument();
    expect(screen.queryByText('Up next')).not.toBeInTheDocument(); // three is not a match
    expect(btn('Dave')).toBeInTheDocument(); // his tile is plain again: no In, no On deck
  });

  it('reorders the queue from an up next chip', async () => {
    render(<App />);
    await openBoard(/^Balanced/);

    await click(chip('Eve', upNext()));
    const d = dialog('Change Eve');
    expect(within(d).getByText('Waiting, position 1')).toBeInTheDocument();
    await click(btn('Henry', d));
    // Eve and Henry trade queue places, which re-slots the panel
    await waitFor(() => expect(chipOrder(upNext())).toEqual(['Henry', 'Grace', 'Frank', 'Eve']));

    await click(btn('Call players up next'));
    expect(said().at(-1)).toBe('Get ready. Up next. Team one, Henry and Grace. Versus team two, Frank and Eve.');
  });

  it('undoes a win together with the stage it triggered', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(within(courtCard(1)).getByText('Staged')).toBeInTheDocument());

    await click(btn(/Undo: court 1, team 1 won/));
    await waitFor(() => expect(within(courtCard(1)).getByText('Live')).toBeInTheDocument());
    expect(within(courtCard(1)).getByText('Alice')).toBeInTheDocument();
  });
});
