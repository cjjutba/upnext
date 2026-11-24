import { Button } from './Button';
import { AppDialog } from './AppDialog';
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
  const target = info(draft);
  const sameMode = target.id === info(from).id;
  const unchanged = draft.template === from.template && draft.winCap === from.winCap;
  const title = sameMode ? `Adjust ${target.label} settings?` : `Switch to ${target.label}?`;
  const split = draft.template === 'winners-split';

  const line = (text: string) => (
    <span key={text} style={{ font: '400 15px/1.5 var(--font-sans)', color: 'var(--text-secondary)' }}>{text}</span>
  );

  return (
    <AppDialog label={title} onClose={onCancel} width="520px">
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
                variant="secondary" pressed={split} ariaLabel="Toggle split winners"
                onClick={() => onDraftChange({ ...draft, template: templateForMode('winners', !split) })}>
                {split ? 'Split winners: on' : 'Split winners: off'}
              </Button>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', padding: '12px var(--space-4)', borderTop: '1px solid var(--border)' }}>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={unchanged} onClick={onConfirm}>
            {sameMode ? 'Apply' : `Switch to ${target.label}`}
          </Button>
        </div>
    </AppDialog>
  );
}
