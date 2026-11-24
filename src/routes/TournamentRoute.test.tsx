import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { db } from '../db/db';
import { createTournament, dispatchTournament, loadTournament } from '../db/tournamentStore';
import { defaultDivisionRules } from '../domain/tournament';
import { startSession } from '../domain/commands';
import { append } from '../db/eventStore';

const name = 'Synthetic Unidos and Open';
const players = [
  { id: 'mia', name: 'Mia' }, { id: 'carlo', name: 'Carlo' },
  { id: 'bea', name: 'Bea' }, { id: 'nico', name: 'Nico' },
];

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: { value(this: HTMLDialogElement) { this.open = true; }, configurable: true },
      close: { value(this: HTMLDialogElement) { this.open = false; }, configurable: true },
    });
  }
});

beforeEach(async () => {
  await db.tournamentEvents.clear();
  await db.sessionEvents.clear();
  await db.players.clear();
  await db.meta.clear();
  window.history.replaceState(null, '', '/app/tournament');
  await db.players.bulkAdd(players.map((player) => ({ ...player, createdAt: 1, updatedAt: 1 })));
});

afterEach(cleanup);

function fixedSetup() {
  return createTournament({ name, date: '', courts: [{ id: 'court-one', name: 'Court 1' }] });
}

const click = (element: HTMLElement) => act(() => { fireEvent.click(element); });

describe('tournament routes', () => {
  it('can open the tournament directly with a live open play session, then return to that session', async () => {
    for (const action of startSession(
      { courts: 1, template: 'all-off', winCap: 2 },
      players.map((player) => player.id),
    )) await append(action);
    await fixedSetup();
    render(<App />);
    await screen.findByRole('heading', { name });
    expect(location.pathname).toBe('/app/tournament');
    await click(screen.getByRole('button', { name: 'Open play' }));
    await screen.findByRole('button', { name: 'Start match on court 1' });
    expect(location.pathname).toBe('/app/board');
    await click(screen.getByRole('link', { name: 'Tournament' }));
    await screen.findByRole('heading', { name });
    expect(location.pathname).toBe('/app/tournament');
  });

  it('confirms the same persisted blind draw after reopening the route', async () => {
    const { id } = await fixedSetup();
    await dispatchTournament(id, {
      type: 'configure-division', divisionId: 'unidos', rules: { ...defaultDivisionRules('unidos'), mode: 'blind-teams' },
    });
    for (const player of players) await dispatchTournament(id, { type: 'set-entry', divisionId: 'unidos', playerId: player.id, clubMember: true });

    const view = render(<App />);
    await click(await screen.findByRole('button', { name: 'Preview draw' }));
    await screen.findByRole('button', { name: 'Lock draw' });
    const first = (await loadTournament(id))?.divisions.unidos.draw;
    expect(first?.pairs).toHaveLength(2);

    view.unmount();
    render(<App />);
    expect((await loadTournament(id))?.divisions.unidos.draw).toEqual(first);
    const sameLock = await screen.findByRole('button', { name: 'Lock draw' });
    await click(sameLock);
    await waitFor(async () => expect((await loadTournament(id))?.divisions.unidos.confirmedDraws).toEqual([first]));
  });

  it('keeps an invalid score draft, records the correct sides and shows the score in evidence', async () => {
    const { id } = await fixedSetup();
    await dispatchTournament(id, {
      type: 'set-team', divisionId: 'women', team: { id: 'poppy', name: 'Poppy', playerIds: ['mia', 'carlo'] },
    });
    await dispatchTournament(id, {
      type: 'set-team', divisionId: 'women', team: { id: 'iris', name: 'Iris', playerIds: ['bea', 'nico'] },
    });
    const locked = await dispatchTournament(id, { type: 'lock-division', divisionId: 'women' });
    const fixture = locked.divisions.women.matches[0];
    await dispatchTournament(id, { type: 'assign-court', divisionId: 'women', matchId: fixture.id, courtId: 'court-one' });
    await dispatchTournament(id, { type: 'start-match', divisionId: 'women', matchId: fixture.id });

    render(<App />);
    await click(await screen.findByRole('button', { name: 'Record score on Court 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Record score' });
    const first = within(dialog).getByRole('spinbutton', { name: /Game 1, Poppy/ });
    const second = within(dialog).getByRole('spinbutton', { name: /Game 1, Iris/ });
    fireEvent.change(first, { target: { value: '10' } });
    fireEvent.change(second, { target: { value: '9' } });
    await click(within(dialog).getByRole('button', { name: 'Save result' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/scor/);
    expect(first).toHaveValue(10);
    fireEvent.change(first, { target: { value: '11' } });
    await click(within(dialog).getByRole('button', { name: 'Save result' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await click(screen.getByRole('button', { name: 'Standings' }));
    await click(screen.getByRole('button', { name: "Women's Doubles" }));
    expect(await screen.findByText('Final')).toBeVisible();
    expect(screen.getAllByText('11 to 9').length).toBeGreaterThan(0);
    expect((await loadTournament(id))?.divisions.women.matches[0].result).toEqual({ type: 'played', games: [[11, 9]] });
  });
});
