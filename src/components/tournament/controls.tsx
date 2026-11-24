import { AppDialog } from '../AppDialog';
import type { CSSProperties, ReactNode } from 'react';
import { IconButton } from '../IconButton';

export const stack: CSSProperties = { display: 'grid', gap: 'var(--space-3)', minWidth: 0 };
export const row: CSSProperties = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' };
export const muted: CSSProperties = { margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-ui)', lineHeight: 1.5 };
export const control: CSSProperties = {
  minHeight: 'var(--tap-min)', width: '100%', minWidth: 0, background: 'var(--bg)', color: 'var(--text)',
  border: '1px solid var(--border-hover)', borderRadius: 'var(--radius-control)',
  font: '400 16px var(--font-sans)', padding: '0 var(--space-2)',
};
export const grid: CSSProperties = {
  display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
};

export function Panel({ title, aside, children, kind, heading = 'h2' }: {
  title: string; aside?: ReactNode; children: ReactNode; kind?: 'court' | 'fixture'; heading?: 'h2' | 'h3';
}) {
  const Heading = heading;
  return (
    <section className="tournament-panel" data-kind={kind}>
      <div className="panel-heading">
        <Heading className="display">{title}</Heading>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'grid', gap: 'var(--space-1)', minWidth: 0 }}>
    <span style={{ fontSize: 'var(--text-ui)', fontWeight: 500 }}>{label}</span>
    {children}
  </label>;
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return <details style={{ borderTop: '1px solid var(--border)' }}>
    <summary style={{ paddingBlock: 'var(--space-3)', minHeight: 'var(--tap-min)', cursor: 'pointer', fontWeight: 500 }}>{title}</summary>
    <div style={stack}>{children}</div>
  </details>;
}

export function Choices<T extends string>({ label, value, options, onChange, navigation }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
  navigation?: boolean;
}) {
  return <div role="group" aria-label={label} className="tournament-choices" data-navigation={navigation || undefined}>
    {options.map((option) => (
      <button key={option.value} type="button" className="action" data-variant={navigation ? "ghost" : "secondary"}
        aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
        {option.label}
      </button>
    ))}
  </div>;
}

export function TournamentDialog({ title, onClose, busy, children }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  return (
    <AppDialog label={title} onClose={onClose} busy={busy} dismissOnBackdrop={false}>
      <div className="tournament-dialog" style={stack}>
        <div className="panel-heading">
          <h2 className="display" style={{ margin: 0, fontSize: 'var(--text-h2)', flex: 1 }}>{title}</h2>
          <IconButton icon="x" ariaLabel="Close dialog" onClick={() => { if (!busy) onClose(); }} />
        </div>
        {children}
      </div>
    </AppDialog>
  );
}
