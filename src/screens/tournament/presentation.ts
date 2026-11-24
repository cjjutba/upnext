import type { DivisionId, DivisionRules, MatchResult, MatchSource, ScoreFormat, TournamentMatch } from '../../domain/tournament';

export const divisionNames: Record<DivisionId, string> = {
  unidos: 'Unidos', women: "Women's Doubles", mixed: 'Mixed Doubles', men: "Men's Doubles",
};

export const divisionOptions = Object.entries(divisionNames).map(([value, label]) => ({ value: value as DivisionId, label }));

export function formatScoreRule(rule: ScoreFormat): string {
  const match = rule.gamesToWin === 1 ? 'One game' : `Best of ${rule.gamesToWin * 2 - 1}`;
  const cap = rule.pointCap === null ? 'no cap' : `cap of ${rule.pointCap}`;
  return `${match}, play to ${rule.pointsToWin}, win by ${rule.winBy}, ${cap}.`;
}

export function tieRuleText(rules: DivisionRules): string {
  const policy = rules.tiePolicy === 'joint' ? 'Unresolved ties share a place.' : 'Settle unresolved ties by playoff.';
  return rules.mode === 'rotating'
    ? `Wins, comparable head-to-head, opponents' win rate in other games, then point differential with full scores. ${policy}`
    : `Match wins, comparable head-to-head, then point differential with comparable scores. ${policy}`;
}

export function withdrawRuleText(rules: DivisionRules): string {
  return rules.withdrawalPolicy === 'forfeit'
    ? 'Keep played results. Score eligible remaining matches as forfeits.'
    : 'Keep played results. Cancel remaining matches.';
}

export function resultText(result: MatchResult): string {
  switch (result.type) {
    case 'played': return result.games.map(([a, b]) => `${a} to ${b}`).join(', ');
    case 'forfeit': return `Forfeit. ${result.reason}`;
    case 'cancelled': return `Cancelled. ${result.reason}`;
  }
}

export function fixtureLabel(match: TournamentMatch): string {
  switch (match.phase) {
    case 'rotation': return `Draw ${match.round}`;
    case 'round-robin': return `Round ${match.round}`;
    case 'pool': return `Pool ${match.pool}, round ${match.round}`;
    case 'playoff': return `Playoff round ${match.round}`;
  }
}

export function sourceLabel(source: MatchSource, matchRef: (id: string) => string): string {
  return source.type === 'pool-place' ? `Pool ${source.pool} place ${source.place}` : `Winner of ${matchRef(source.matchId)}`;
}
