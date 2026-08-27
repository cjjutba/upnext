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
const courtCard = (n: number) => screen.getByLabelText(`Close court ${n}`).closest('[data-court]') as HTMLElement;

/** The queue panel under the courts: the next four, or the challengers a winners template promises. */
const upNext = () =>
  (screen.queryByText('Up next') ?? screen.getByText('Next challengers')).closest('div')!.parentElement!;

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
    await click(btn('Tap again to end'));
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
    await click(btn('Tap again to end'));
    await screen.findByText('Session summary');
    await waitFor(() => expect(said()).toHaveLength(3));
    expect(said().filter((l) => l.startsWith('Session complete.'))).toHaveLength(1);
  });

  it('lifts a player off a live court, offers the open seat, and seats whoever is picked', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    expect(btn(/Team 1 wins/, courtCard(1))).toBeInTheDocument();

    await click(chip('Alice', courtCard(1)));
    await click(btn('Off the court', dialog(/Change Alice/)));
    await screen.findByLabelText('Add a player to court 1, team 1, seat 1');

    const opened = courtCard(1);
    expect(within(opened).getByText('Tap to add player')).toBeInTheDocument();
    expect(within(opened).queryByRole('button', { name: /Team 1 wins/ })).not.toBeInTheDocument();
    expect(within(opened).queryByRole('button', { name: /Team 2 wins/ })).not.toBeInTheDocument();
    expect(btn('Fill court 1', opened)).toBeInTheDocument();
    expect(chipOrder(opened)).toEqual(['Carol', 'Bob', 'Dave']); // three left on court

    await click(btn('Add a player to court 1, team 1, seat 1', courtCard(1)));
    const picker = await screen.findByRole('dialog', { name: 'Add a player to court 1' });
    await click(within(picker).getByText('Eve').closest('button')!);

    await waitFor(() => expect(chipOrder(courtCard(1))).toEqual(['Eve', 'Carol', 'Bob', 'Dave']));
    expect(btn(/Team 1 wins/, courtCard(1))).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Add a player/ })).not.toBeInTheDocument();
  });

  it('fills an open seat straight from the front of the queue', async () => {
    render(<App />);
    await startMatch(/^Balanced/);

    await click(chip('Bob', courtCard(1)));
    await click(btn('Off the court', dialog(/Change Bob/)));
    await screen.findByLabelText('Fill court 1');
    await click(btn('Fill court 1', courtCard(1)));

    // Bob went to the queue front when he came off, so filling puts him straight back
    await waitFor(() => expect(chipOrder(courtCard(1))).toEqual(['Alice', 'Carol', 'Bob', 'Dave']));
    expect(btn(/Team 2 wins/, courtCard(1))).toBeInTheDocument();
  });

  it('offers Off the court only on a live court, never on a staged one', async () => {
    render(<App />);
    await openBoard(/^Balanced/);

    await click(chip('Alice', courtCard(1)));
    const staged = dialog(/Change Alice/);
    expect(within(staged).queryByRole('button', { name: 'Off the court' })).not.toBeInTheDocument();
    expect(btn('Remove from session', staged)).toBeInTheDocument();
    await click(btn('Close player options', staged));

    await click(btn('Start match on court 1'));
    await screen.findByLabelText('Team 1 wins on court 1');
    await click(chip('Alice', courtCard(1)));
    expect(btn('Off the court', dialog(/Change Alice/))).toBeInTheDocument();
  });

  it('ends the session only on the second tap', async () => {
    render(<App />);
    await startMatch(/^Balanced/);

    await click(btn('End session'));
    expect(screen.queryByText('Session summary')).not.toBeInTheDocument(); // still live, armed
    await click(btn('Tap again to end'));
    await screen.findByText('Session summary');
  });

  it('reopens the last ended session from history onto the live board', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    await click(btn(/Team 1 wins/, courtCard(1)));

    await click(btn('End session'));
    await click(btn('Tap again to end'));
    await screen.findByText('Session summary');
    await click(btn('New session'));
    await screen.findByText('Roster');

    await click(await screen.findByRole('button', { name: 'Reopen' }));
    await screen.findByLabelText('Close court 1'); // live board again, court occupied

    const dialog = await openStandings();
    await waitFor(() => expect(within(dialog).getAllByText('100%')).toHaveLength(2)); // the win survived
  });

  it('opens an old session summary from history silently, with export still offered', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    await click(btn(/Team 1 wins/, courtCard(1)));

    await click(btn('End session'));
    await click(btn('Tap again to end'));
    await screen.findByText('Session summary');
    await click(btn('New session'));
    await screen.findByText('Roster');

    spoken.length = 0;
    await click(await screen.findByRole('button', { name: 'View' }));
    await screen.findByText('Final standings');
    expect(btn(/Share summary/)).toBeInTheDocument();

    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(said()).toEqual([]); // browsing history never reads the podium aloud
  });

  it('hand-composes a lineup: substitute a waiting player onto the court', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1));

    await click(btn('Edit lineup on court 1'));
    const dialog = await screen.findByRole('dialog', { name: 'Edit court 1 lineup' });
    expect(btn('Apply lineup', dialog)).toBeDisabled(); // nothing changed yet

    await click(btn('Carol', dialog)); // on court in every partition: the front four are Alice..Dave
    await click(btn('Eve', dialog)); // first waiting player
    await click(btn('Apply lineup', dialog));

    await waitFor(() => expect(said().at(-1)).toMatch(/^Court 1\. Lineup change\. .*Eve.*\.$/));
    expect(said().at(-1)).not.toContain('Carol');
    expect(within(courtCard(1)).getByText('Eve')).toBeInTheDocument();
    expect(within(courtCard(1)).queryByText('Carol')).not.toBeInTheDocument();
    expect(screen.getByText('Undo: court 1 lineup')).toBeInTheDocument();
  });

  it('keeps the winners on court in Winners mode, staged, and promises only the challengers', async () => {
    render(<App />);
    await startMatch(/^Winners/);
    await waitFor(() => expect(said()).toHaveLength(1));
    const winners = ['Alice', 'Carol'];

    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(within(courtCard(1)).getByText('Staged')).toBeInTheDocument());
    for (const name of winners) expect(within(courtCard(1)).getByText(name)).toBeInTheDocument();
    expect(within(courtCard(1)).queryByText('0:00')).not.toBeInTheDocument(); // no clock until Start

    // the four behind them depends on who wins, so the queue promises only the two who are certain
    expect(screen.getByText('Next challengers')).toBeInTheDocument();
    expect(screen.queryByText('Up next')).not.toBeInTheDocument();
    expect(within(upNext()).getByText('Winners stay')).toBeInTheDocument();
    await click(btn('Call players up next'));
    expect(said().at(-1)).toMatch(/^Get ready\. Next challengers, \w+ and \w+\. You are on whoever wins\.$/);
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

describe('App: switching matching mode mid-session', () => {
  beforeEach(async () => {
    installSpeechStub();
    await reset();
  });
  afterEach(cleanup);

  /** The four names showing on a court right now. */
  const lineup = (n: number) => NAMES.filter((name) => within(courtCard(n)).queryByText(name) !== null);

  const openMenu = async () => {
    await click(btn('Change matching mode'));
  };

  it('asks before switching, and appends nothing until the organizer confirms', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    const before = lineup(1);
    expect(before).toHaveLength(4);

    await openMenu();
    await click(btn(/^Social mix/));

    const dialog = await screen.findByRole('dialog', { name: 'Switch to Social mix?' });
    expect(within(dialog).getByText(/Courts in play finish under their current lineups/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Every game formed from now on uses Social mix/)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Next game would be .+ vs .+\.$/)).toBeInTheDocument();
    // still Balanced behind the modal, and nobody has moved
    expect(btn('Change matching mode')).toHaveTextContent('Mode: Balanced');
    expect(lineup(1)).toEqual(before);

    await click(btn('Cancel', dialog));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Switch to Social mix?' })).not.toBeInTheDocument());
    expect(btn('Change matching mode')).toHaveTextContent('Mode: Balanced');
    expect(screen.queryByText('Undo: Social mix mode')).not.toBeInTheDocument();
  });

  it('applies the mode on confirm without taking anyone off a court', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    const before = lineup(1);

    await openMenu();
    await click(btn(/^Social mix/));
    await click(btn('Switch to Social mix', await screen.findByRole('dialog', { name: 'Switch to Social mix?' })));

    await waitFor(() => expect(btn('Change matching mode')).toHaveTextContent('Mode: Social mix'));
    expect(lineup(1)).toEqual(before); // next game only: the live court is untouched
    expect(await screen.findByText('Undo: Social mix mode')).toBeInTheDocument();
  });

  it('re-picking the live mode closes the menu instead of confirming a no-op', async () => {
    render(<App />);
    await startMatch(/^Balanced/);

    await openMenu();
    await click(btn(/^Balanced/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(btn('Change matching mode')).toHaveTextContent('Mode: Balanced');
  });

  it('confirms the win cap and the split toggle in the same modal', async () => {
    render(<App />);
    await startMatch(/^Winners/);

    await openMenu();
    await click(btn(/^Winners/));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust Winners settings?' });
    expect(btn('Apply', dialog)).toBeDisabled(); // nothing proposed yet

    await click(btn('Win cap up', dialog));
    await click(btn('Toggle split winners', dialog));
    await click(btn('Apply', dialog));

    await waitFor(() => expect(btn('Change matching mode')).toHaveTextContent('Mode: Winners'));
    expect(await screen.findByText('Undo: Winners mode')).toBeInTheDocument();
    await openMenu();
    expect(screen.getByText('Win cap 4. Split winners on. Tap to adjust.')).toBeInTheDocument();
  });

  it('switches into Winners from another mode and drops the queue panel back to challengers', async () => {
    render(<App />);
    await startMatch(/^Balanced/);
    expect(screen.getByText('Up next')).toBeInTheDocument();

    await openMenu();
    await click(btn(/^Winners/));
    const dialog = await screen.findByRole('dialog', { name: 'Switch to Winners?' });
    expect(within(dialog).getByText(/^Next challengers would be .+ and .+\.$/)).toBeInTheDocument();
    await click(btn('Switch to Winners', dialog));

    await waitFor(() => expect(btn('Change matching mode')).toHaveTextContent('Mode: Winners'));
    // the four is no longer knowable, so the panel names the two who are certain
    expect(screen.getByText('Next challengers')).toBeInTheDocument();
    expect(screen.queryByText('Up next')).not.toBeInTheDocument();
  });
});
