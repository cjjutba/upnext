import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { MODES, modeForTemplate, modeLabel, templateForMode, type MatchingMode } from '../domain/modes';
import type { RuleConfig, RuleTemplate } from '../domain/types';

/**
 * Picks a mode, and nothing more. It never dispatches: the request goes up to
 * App, which confirms it in a modal before a single event is appended. The win
 * cap and the split toggle live in that modal, so the whole winners config is
 * confirmed in one decision.
 */
export function ModeMenu({ rule, onRequestChange }: {
  rule: RuleConfig;
  onRequestChange: (template: RuleTemplate, winCap: number) => void;
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
    setOpen(false);
    // re-picking the live mode has nothing to confirm, except in winners where the row is the way to the cap and the split
    if (mode === current && mode !== 'winners') return;
    onRequestChange(templateForMode(mode, mode === 'winners' ? split : false), rule.winCap);
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
        {'Mode: ' + modeLabel(rule.template)}
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
              {m.id === 'winners' && current === 'winners' ? (
                <span className="mono" style={{ font: '400 13px/1.4 var(--font-mono)', color: 'var(--text-tertiary)' }}>
                  {`Win cap ${rule.winCap}. Split winners ${split ? 'on' : 'off'}. Tap to adjust.`}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
