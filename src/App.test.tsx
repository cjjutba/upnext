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
const courtCard = (n: number) => screen.getByLabelText(`Close court ${n}`).closest('div')!.parentElement!;

/** The queue rail, in waiting order. */
const queueList = () => screen.getByText('Queue').closest('section')!;

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
    await screen.findByText('Session summary');
    await waitFor(() => expect(said()).toHaveLength(4));
    expect(said().filter((l) => l.startsWith('Session complete.'))).toHaveLength(1);
  });

  it('lifts a player off a court, offers the open seat, and seats whoever is picked', async () => {
    render(<App />);
    await startSession(/^Balanced/);
    // balanced with eight unrated players takes the front four in roster order
    expect(btn(/Team 1 wins/, courtCard(1))).toBeInTheDocument();

    await click(btn('Alice on court 1. Replace or remove.', courtCard(1)));
    await click(btn('Remove from court', courtCard(1)));
    await screen.findByLabelText('Add a player to court 1, team 1, seat 1');

    const opened = courtCard(1);
    expect(within(opened).getByText('Tap to add player')).toBeInTheDocument();
    expect(within(opened).queryByRole('button', { name: /Team 1 wins/ })).not.toBeInTheDocument();
    expect(within(opened).queryByRole('button', { name: /Team 2 wins/ })).not.toBeInTheDocument();
    expect(btn('Fill court 1', opened)).toBeInTheDocument();
    // Alice went to the front of the queue, ahead of everyone who was already waiting
    expect(within(queueList()).getAllByText(/^(Alice|Eve)$/).map((n) => n.textContent)).toEqual(['Alice', 'Eve']);

    await click(btn('Add a player to court 1, team 1, seat 1', courtCard(1)));
    const dialog = await screen.findByRole('dialog', { name: 'Add a player to court 1' });
    await click(within(dialog).getByText('Eve').closest('button')!);

    await waitFor(() => expect(btn('Eve on court 1. Replace or remove.', courtCard(1))).toBeInTheDocument());
    expect(btn(/Team 1 wins/, courtCard(1))).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Add a player/ })).not.toBeInTheDocument();
  });

  it('fills an open seat straight from the front of the queue', async () => {
    render(<App />);
    await startSession(/^Balanced/);

    await click(btn('Bob on court 1. Replace or remove.', courtCard(1)));
    await click(btn('Remove from court', courtCard(1)));
    await screen.findByLabelText('Fill court 1');
    await click(btn('Fill court 1', courtCard(1)));

    await waitFor(() => expect(btn('Bob on court 1. Replace or remove.', courtCard(1))).toBeInTheDocument());
    expect(btn(/Team 2 wins/, courtCard(1))).toBeInTheDocument();
  });

  it('has no up next call in Winners mode, where the next lineup is not known yet', async () => {
    render(<App />);
    await startSession(/^Winners/);
    await waitFor(() => expect(said()).toHaveLength(1));

    expect(screen.queryByRole('button', { name: 'Call up next' })).not.toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 1400)));
    expect(said().some((s) => s.startsWith('Up next'))).toBe(false);
  });
});
