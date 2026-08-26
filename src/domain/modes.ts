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
  { id: 'winners', label: 'Winners', description: 'Winning pair stays on. Win cap and split winners are configurable.' },
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

export function modeLabel(template: RuleTemplate): string {
  return MODES.find((m) => m.id === modeForTemplate(template))!.label;
}
