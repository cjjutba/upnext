import type { RuleTemplate } from './types';

export type MatchingMode = 'balanced' | 'social' | 'classic' | 'winners';

export interface ModeInfo {
  id: MatchingMode;
  label: string;
  description: string;
  recommended?: boolean;
}

export const MODES: ModeInfo[] = [
  { id: 'balanced', label: 'Balanced', description: 'Longest rested play next. Teams balanced by rating, repeat matchups avoided.', recommended: true },
  { id: 'social', label: 'Social mix', description: 'Avoids repeat partners and opponents. Ratings are ignored.' },
  { id: 'classic', label: 'Classic queue', description: 'Pure paddle queue: first four in line play, all four rejoin the back.' },
  { id: 'winners', label: 'Winners', description: 'Winners stay on. With Split on, each winner anchors a new pair instead. Win cap applies.' },
];

export function templateForMode(mode: MatchingMode, splitWinners: boolean): RuleTemplate {
  if (mode === 'winners') return splitWinners ? 'winners-split' : 'winners-stay';
  if (mode === 'classic') return 'all-off';
  return mode;
}

export function modeForTemplate(template: RuleTemplate): MatchingMode {
  if (template === 'winners-stay' || template === 'winners-split') return 'winners';
  if (template === 'all-off') return 'classic';
  return template;
}

/**
 * Total on purpose. describeEvent labels events from imported logs, which a
 * newer build may have written with a template this one has never heard of,
 * and rule 4 says a foreign log must never crash. Coverage of the ids this
 * build does know is asserted in modes.test.ts.
 */
export function modeLabel(template: RuleTemplate): string {
  return MODES.find((m) => m.id === modeForTemplate(template))?.label ?? template;
}
