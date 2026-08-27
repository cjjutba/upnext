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

/** Check in everyone, drop to one court, pick a mode, start. Leaves the board on screen. */
async function startSession(mode: RegExp) {
  await screen.findByText('Roster');
  await click(btn('Check in all'));
  await click(btn(mode));
  await click(btn('Courts down'));
  await click(btn(/Start session/));
  await screen.findByLabelText('Close court 1'); // board only: "Courts" also labels the setup stepper
}

/** The card div that owns a court's close button. */
const courtCard = (n: number) => screen.getByLabelText(`Close court ${n}`).closest('[data-court]') as HTMLElement;

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

  it('calls the court on start, then the winner and the refill it triggers', async () => {
    render(<App />);
    await startSession(/^Balanced/);

    await waitFor(() => expect(said()).toHaveLength(1));
    expect(said()[0]).toMatch(/^Court 1\. \w+ and \w+ versus \w+ and \w+\. Please proceed to court 1\.$/);

    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(said()).toHaveLength(3));
    expect(said()[1]).toMatch(/^Court 1\. \w+ and \w+ win\.$/);
    expect(said()[2]).toMatch(/^Court 1\. .* Please proceed to court 1\.$/);
  });

  it('records wins in Balanced mode and ranks them in the live standings', async () => {
    render(<App />);
    await startSession(/^Balanced/);
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
    await startSession(/^Balanced/);
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
    await startSession(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1));

    view.unmount();
    spoken.length = 0;
    render(<App />);
    await screen.findByLabelText('Close court 1'); // resumed straight onto the board
    await act(() => new Promise((r) => setTimeout(r, 1400))); // past the up next settle window
    expect(said()).toEqual([]);

    await click(btn(/Team 2 wins/, courtCard(1)));
    await waitFor(() => expect(said().length).toBeGreaterThan(0));
    expect(said()[0]).toMatch(/win\.$/);
  });

  it('reads the podium when the session ends, and ranks the summary', async () => {
    render(<App />);
    await startSession(/^Balanced/);
    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(said()).toHaveLength(3));

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

  it('calls the up next four once the queue settles', async () => {
    render(<App />);
    await startSession(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1));
    await waitFor(() => expect(said().at(-1)).toMatch(/^Up next\. .* Please get ready\.$/), { timeout: 3000 });
  });

  it('says everything exactly once under StrictMode, which is how main.tsx mounts it', async () => {
    render(<StrictMode><App /></StrictMode>);
    await startSession(/^Balanced/);
    await waitFor(() => expect(said()).toHaveLength(1)); // the court call, not two of them

    await click(btn(/Team 1 wins/, courtCard(1)));
    await waitFor(() => expect(said()).toHaveLength(3));

    await click(btn('End session'));
    await click(btn('Tap again to end'));
    await screen.findByText('Session summary');
    await waitFor(() => expect(said()).toHaveLength(4));
    expect(said().filter((l) => l.startsWith('Session complete.'))).toHaveLength(1);
  });

  it('ends the session only on the second tap', async () => {
    render(<App />);
    await startSession(/^Balanced/);

    await click(btn('End session'));
    expect(screen.queryByText('Session summary')).not.toBeInTheDocument(); // still live, armed
    await click(btn('Tap again to end'));
    await screen.findByText('Session summary');
  });

  it('reopens the last ended session from history onto the live board', async () => {
    render(<App />);
    await startSession(/^Balanced/);
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
    await startSession(/^Balanced/);
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
    await startSession(/^Balanced/);
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

  it('calls the challengers in Winners mode, where the full four is not known yet', async () => {
    render(<App />);
    await startSession(/^Winners/);
    await waitFor(() => expect(said()).toHaveLength(1));

    // the four depends on who wins, so the board promises only the two who are certain
    expect(screen.queryByRole('button', { name: 'Call up next' })).not.toBeInTheDocument();
    expect(btn('Call next challengers')).toBeInTheDocument();
    await waitFor(() => expect(said().at(-1)).toMatch(/^Next challengers\. \w+ and \w+\. Please get ready\.$/), { timeout: 3000 });
    expect(said().some((s) => s.startsWith('Up next'))).toBe(false);
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
    await startSession(/^Balanced/);
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
    await startSession(/^Balanced/);
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
    await startSession(/^Balanced/);

    await openMenu();
    await click(btn(/^Balanced/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(btn('Change matching mode')).toHaveTextContent('Mode: Balanced');
  });

  it('confirms the win cap and the split toggle in the same modal', async () => {
    render(<App />);
    await startSession(/^Winners/);

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

  it('switches into Winners from another mode and previews the challengers', async () => {
    render(<App />);
    await startSession(/^Balanced/);
    expect(btn('Call up next')).toBeInTheDocument();

    await openMenu();
    await click(btn(/^Winners/));
    const dialog = await screen.findByRole('dialog', { name: 'Switch to Winners?' });
    expect(within(dialog).getByText(/^Next challengers would be .+ and .+\.$/)).toBeInTheDocument();
    await click(btn('Switch to Winners', dialog));

    await waitFor(() => expect(btn('Change matching mode')).toHaveTextContent('Mode: Winners'));
    expect(btn('Call next challengers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call up next' })).not.toBeInTheDocument();
  });
});
