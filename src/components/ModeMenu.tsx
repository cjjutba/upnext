import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { Stepper } from './Stepper';
import { MODES, modeForTemplate, templateForMode, type MatchingMode } from '../domain/modes';
import type { RuleConfig, RuleTemplate } from '../domain/types';

export function ModeMenu({ rule, onChange }: {
  rule: RuleConfig;
  onChange: (template: RuleTemplate, winCap: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = modeForTemplate(rule.template);
  const split = rule.template === 'winners-split';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (mode: MatchingMode) => {
    onChange(templateForMode(mode, mode === 'winners' ? split : false), rule.winCap);
    if (mode !== 'winners') setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(!open)} aria-label="Change matching mode"
        style={{
          display: 'inline-flex', alignItems: 'center', height: '40px', padding: '0 var(--space-3)',
          background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-control)', font: '500 14px/1 var(--font-sans)', cursor: 'pointer',
        }}>
        {'Mode: ' + MODES.find((m) => m.id === current)!.label}
      </button>
      {open ? (
        <div style={{
          position: 'absolute', top: 'calc(100% + var(--space-2))', left: 0, zIndex: 20,
          width: '340px', maxWidth: '80vw', padding: 'var(--space-2)',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-menu)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        }}>
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => pick(m.id)} aria-pressed={current === m.id}
              style={{
                display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left', width: '100%',
                padding: 'var(--space-3)', cursor: 'pointer', background: 'var(--bg)', color: 'var(--text)',
                border: current === m.id ? '1px solid var(--gray-1000)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
              }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ font: '600 16px/1.2 var(--font-sans)' }}>{m.label}</span>
                {m.recommended ? <StatusBadge status="live" label="Recommended" /> : null}
              </span>
              <span style={{ font: '400 14px/1.4 var(--font-sans)', color: 'var(--text-secondary)' }}>{m.description}</span>
            </button>
          ))}
          {current === 'winners' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: '0 var(--space-3) var(--space-2)' }}>
              <Stepper label="Win cap" value={rule.winCap} min={1} max={5} unit="games"
                onChange={(v) => onChange(rule.template, v)} />
              <Button variant={split ? 'primary' : 'secondary'} ariaLabel="Toggle split winners"
                onClick={() => onChange(split ? 'winners-stay' : 'winners-split', rule.winCap)}>
                {split ? 'Split winners: on' : 'Split winners: off'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
