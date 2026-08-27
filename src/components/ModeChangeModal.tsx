import { useEffect } from 'react';
import { Button } from './Button';
import { Stepper } from './Stepper';
import { MODES, modeForTemplate, modeLabel, templateForMode } from '../domain/modes';
import type { ModeInfo } from '../domain/modes';
import type { RuleConfig } from '../domain/types';

/** from can carry a template an imported log wrote and this build has never heard of, so this never asserts. */
const info = (rule: RuleConfig): ModeInfo => {
  const mode = modeForTemplate(rule.template);
  return MODES.find((m) => m.id === mode) ?? { id: mode, label: modeLabel(rule.template), description: '' };
};

/**
 * Confirms every rule change before a single event is appended. The win cap and
 * the split toggle live here rather than in the menu so a winners config is one
 * decision the organizer confirms once, not one confirmation per stepper tap.
 */
export function ModeChangeModal({ from, draft, onDraftChange, previewLine, onCancel, onConfirm }: {
  /** The rule the session is running on right now. */
  from: RuleConfig;
  /** The rule being proposed. Nothing is appended until it is confirmed. */
  draft: RuleConfig;
  onDraftChange: (rule: RuleConfig) => void;
  /** Rendered by the caller, which owns the roster names. Null when no game can be formed yet. */
  previewLine: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const target = info(draft);
  const sameMode = target.id === info(from).id;
  const unchanged = draft.template === from.template && draft.winCap === from.winCap;
  const title = sameMode ? `Adjust ${target.label} settings?` : `Switch to ${target.label}?`;
  const split = draft.template === 'winners-split';

  const line = (text: string) => (
    <span key={text} style={{ font: '400 15px/1.5 var(--font-sans)', color: 'var(--text-secondary)' }}>{text}</span>
  );

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(0, 0, 0, 0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
      }}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px', maxWidth: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)',
        }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h2)' }}>{title}</span>
          {line(target.description)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-3)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-card)' }}>
            {line('Courts in play finish under their current lineups. Nobody comes off a court.')}
            {line(`Every game formed from now on uses ${target.label}.`)}
            {previewLine ? (
              <span className="display" style={{ fontSize: '15px' }}>{previewLine}</span>
            ) : null}
          </div>
          {target.id === 'winners' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Stepper
                label="Win cap" value={draft.winCap} min={1} max={5} unit="games"
                onChange={(winCap) => onDraftChange({ ...draft, winCap })} />
              <Button
                variant={split ? 'primary' : 'secondary'} ariaLabel="Toggle split winners"
                onClick={() => onDraftChange({ ...draft, template: templateForMode('winners', !split) })}>
                {split ? 'Split winners: on' : 'Split winners: off'}
              </Button>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={unchanged} onClick={onConfirm}>
            {sameMode ? 'Apply' : `Switch to ${target.label}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
