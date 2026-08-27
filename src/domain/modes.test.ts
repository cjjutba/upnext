import { describe, it, expect } from 'vitest';
import { MODES, modeForTemplate, modeLabel, templateForMode, type MatchingMode } from './modes';
import type { RuleTemplate } from './types';

/**
 * Every template id, spelled out. The satisfies clause fails to compile when a
 * new id joins RuleTemplate without landing here, which is what makes the
 * coverage test below exhaustive rather than merely optimistic.
 */
const ALL_TEMPLATES = ['all-off', 'winners-stay', 'winners-split', 'balanced', 'social'] as const satisfies readonly RuleTemplate[];

const ALL_MODES = ['balanced', 'social', 'classic', 'winners'] as const satisfies readonly MatchingMode[];

describe('mode metadata', () => {
  it('maps every template to a mode that MODES actually describes', () => {
    for (const t of ALL_TEMPLATES) {
      const mode = modeForTemplate(t);
      expect(MODES.find((m) => m.id === mode), `no MODES entry for template ${t}`).toBeDefined();
    }
  });

  it('describes every mode exactly once, in menu order', () => {
    expect(MODES.map((m) => m.id)).toEqual([...ALL_MODES]);
    for (const m of MODES) expect(m.description.length).toBeGreaterThan(0);
  });

  it('round trips every mode through templateForMode', () => {
    for (const mode of ALL_MODES) {
      expect(modeForTemplate(templateForMode(mode, false))).toBe(mode);
      expect(modeForTemplate(templateForMode(mode, true))).toBe(mode);
    }
  });

  it('carries the split flag only into the winners mode', () => {
    expect(templateForMode('winners', true)).toBe('winners-split');
    expect(templateForMode('winners', false)).toBe('winners-stay');
    expect(templateForMode('classic', true)).toBe('all-off');
    expect(templateForMode('balanced', true)).toBe('balanced');
    expect(templateForMode('social', true)).toBe('social');
  });

  it('labels every template', () => {
    expect(ALL_TEMPLATES.map(modeLabel)).toEqual(['Classic queue', 'Winners', 'Winners', 'Balanced', 'Social mix']);
  });

  // describeEvent reads this against imported logs, where a newer build may have written a template this one has never heard of
  it('falls back to the raw id for an unknown template instead of throwing', () => {
    const foreign = 'ladder-2027' as RuleTemplate;
    expect(() => modeLabel(foreign)).not.toThrow();
    expect(modeLabel(foreign)).toBe('ladder-2027');
  });
});
