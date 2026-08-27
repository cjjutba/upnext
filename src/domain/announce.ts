import type { Pair, Pairs, SessionEvent, SessionState } from './types';
import type { Standing } from './standings';

export type NameOf = (playerId: string) => string;

/** "Alice and Bob". */
export function pairPhrase(pair: Pair, nameOf: NameOf): string {
  return nameOf(pair[0]) + ' and ' + nameOf(pair[1]);
}

const matchup = (pairs: Pairs, nameOf: NameOf): string =>
  pairPhrase(pairs[0], nameOf) + ' versus ' + pairPhrase(pairs[1], nameOf);

/** The call that sends four people to a court. */
export function courtPhrase(court: number, pairs: Pairs, nameOf: NameOf): string {
  return `Court ${court}. ${matchup(pairs, nameOf)}. Please proceed to court ${court}.`;
}

/**
 * The Call players button. Staging is silent, so this is the only way four
 * people hear their names before a match starts.
 */
export function getReadyPhrase(pairs: Pairs, nameOf: NameOf, court?: number): string {
  const teams = `Team one, ${pairPhrase(pairs[0], nameOf)}. Versus team two, ${pairPhrase(pairs[1], nameOf)}.`;
  return court === undefined ? `Get ready. Up next. ${teams}` : `Get ready. Court ${court}. ${teams}`;
}

/**
 * Phrases for a run of events this device just appended. Never call this with a
 * replayed log: it has no idea an event is old, and a resume would read back
 * every court call of the session.
 */
export function announceBatch(batch: SessionEvent[], stateAfter: SessionState, nameOf: NameOf): string[] {
  const restaged = new Set(batch.filter((e) => e.type === 'game-staged').map((e) => e.court));
  const out: string[] = [];
  for (const e of batch) {
    switch (e.type) {
      case 'game-started':
        out.push(courtPhrase(e.court, e.pairs, nameOf));
        break;
      case 'game-lineup-changed':
        out.push(`Court ${e.court}. Lineup change. ${matchup(e.pairs, nameOf)}.`);
        break;
      case 'game-finished': {
        if (e.winnerPair === undefined) {
          // finishGame stages the next four in the same batch, and the board shows them, so saying it too is noise
          if (!restaged.has(e.court)) out.push(`Court ${e.court}. Game over.`);
          break;
        }
        // the payload carries no pairs, so read them back off the game the reducer just filed
        const game = stateAfter.finishedGames.findLast((g) => g.court === e.court && g.endedAt === e.ts);
        if (game && game.winnerPair !== undefined) {
          out.push(`Court ${e.court}. ${pairPhrase(game.pairs[game.winnerPair], nameOf)} win.`);
        }
        break;
      }
      case 'court-closed':
        out.push(`Court ${e.court} is closed.`);
        break;
      default:
        break; // check-ins, sit-outs, rule changes, undo, and every staging event stay silent
    }
  }
  return out;
}

const ORDINALS = ['first', 'second', 'third'];

function topThree(rows: Standing[], nameOf: NameOf, lead: string, nothingDecided: string): string {
  const podium = rows.filter((r) => r.decided > 0).slice(0, 3);
  if (podium.length === 0) return `${lead} ${nothingDecided}`;
  const lines = podium.map((r, i) => {
    const pct = Math.round(r.winRate * 100);
    const wins = r.wins === 1 ? '1 win' : `${r.wins} wins`;
    const games = r.games === 1 ? '1 game' : `${r.games} games`;
    // doubles ties are the norm, so the ordinal follows the rank, not the row
    const place = i > 0 && podium[i - 1].rank === r.rank
      ? `Also in ${ORDINALS[r.rank - 1]} place`
      : `In ${ORDINALS[r.rank - 1]} place`;
    return `${place}, ${nameOf(r.playerId)}, with ${wins} from ${games}, ${pct} percent.`;
  });
  return [lead, ...lines].join(' ');
}

/** Read at the end of a session. */
export function podiumPhrase(rows: Standing[], nameOf: NameOf): string {
  return topThree(rows, nameOf, 'Session complete.', 'No games finished with a winner, so there is no podium.');
}

/** Read on demand from the live standings. */
export function leaderPhrase(rows: Standing[], nameOf: NameOf): string {
  return topThree(rows, nameOf, 'Live standings.', 'No games have been decided yet.');
}
