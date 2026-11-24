import { DIVISION_IDS } from './types';
import type { DivisionId, DivisionRules, QualifierResolution, TournamentSettings } from './types';

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function filled(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function integer(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

export function validSettings(settings: unknown): settings is TournamentSettings {
  if (!record(settings) || !filled(settings.name) || typeof settings.date !== 'string'
    || !Array.isArray(settings.courts) || settings.courts.length === 0) return false;
  if (settings.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.date)) return false;
    const date = new Date(settings.date);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== settings.date) return false;
  }
  const ids = new Set<string>();
  return settings.courts.every(court => {
    if (!record(court) || !filled(court.id) || !filled(court.name) || ids.has(court.id)
      || (court.availableFrom !== undefined && !integer(court.availableFrom))
      || (court.availableUntil !== undefined && !integer(court.availableUntil))) return false;
    if (typeof court.availableFrom === 'number' && typeof court.availableUntil === 'number'
      && court.availableFrom >= court.availableUntil) return false;
    ids.add(court.id);
    return true;
  });
}

export function divisionId(value: unknown): value is DivisionId {
  return DIVISION_IDS.some(id => value === id);
}

export function validRules(id: DivisionId, value: unknown): value is DivisionRules {
  if (!record(value)) return false;
  const { mode, competition, gamesPerPlayer, score, tiePolicy, withdrawalPolicy } = value;
  if (id === 'unidos' ? mode !== 'rotating' && mode !== 'blind-teams' : mode !== 'fixed-teams') return false;
  if (!integer(gamesPerPlayer, 1) || gamesPerPlayer > 1000 || !record(competition) || !record(score)
    || (tiePolicy !== 'joint' && tiePolicy !== 'playoff')
    || (withdrawalPolicy !== 'forfeit' && withdrawalPolicy !== 'cancel')) return false;
  const { pointsToWin, winBy, gamesToWin, pointCap } = score;
  if (!integer(pointsToWin, 1) || !integer(winBy, 1) || !integer(gamesToWin, 1) || gamesToWin > 99
    || (mode === 'rotating' && gamesToWin !== 1)
    || (pointCap !== null && !integer(pointCap, pointsToWin))) return false;
  if (competition.type === 'round-robin') return true;
  if (competition.type !== 'pools' || mode === 'rotating') return false;
  const { poolSizes, advancePerPool } = competition;
  return Array.isArray(poolSizes) && poolSizes.length === 2
    && poolSizes.every(size => integer(size, 2))
    && integer(advancePerPool, 1) && advancePerPool <= Math.min(...poolSizes) && Number.isInteger(Math.log2(advancePerPool));
}

export function validResolution(value: unknown): value is QualifierResolution | undefined {
  return value === undefined || (record(value) && filled(value.reason)
    && (value.policy === 'keep-started' || value.policy === 'reset-affected'));
}

export function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameData(value, right[index]));
  }
  if (record(left) && record(right)) {
    const keys = Object.keys(left).filter(key => left[key] !== undefined);
    return keys.length === Object.values(right).filter(value => value !== undefined).length
      && keys.every(key => Object.hasOwn(right, key) && sameData(left[key], right[key]));
  }
  return false;
}
