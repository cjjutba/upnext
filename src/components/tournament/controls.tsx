import { useLayoutEffect, useId, useRef } from 'react';
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

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ ...stack, border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: 'var(--space-3)' }}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <h2 className="display" style={{ margin: 0, fontSize: 'var(--text-h3)' }}>{title}</h2>
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

export function Choices<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div role="group" aria-label={label} style={row}>
    {options.map((option) => (
      <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}
        style={{
          ...control, width: 'auto', cursor: 'pointer', paddingInline: 'var(--space-3)',
          fontWeight: 500, background: value === option.value ? 'var(--primary)' : 'var(--bg)',
          color: value === option.value ? 'var(--primary-fg)' : 'var(--text)',
        }}>{option.label}</button>
    ))}
  </div>;
}

export function TournamentDialog({ title, onClose, busy, children }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const close = () => {
    if (busy) return;
    dialog.current?.close();
    onClose();
  };

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }}
      style={{
        width: '520px', maxWidth: 'calc(100% - 2 * var(--space-3))', maxHeight: 'calc(100dvh - 2 * var(--space-3))',
        background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)', padding: 'var(--space-3)',
      }}>
      <div style={stack}>
        <div style={{ ...row, justifyContent: 'space-between' }}>
          <h2 id={titleId} className="display" style={{ margin: 0, fontSize: 'var(--text-h3)', flex: 1 }}>{title}</h2>
          <IconButton icon="x" ariaLabel="Close dialog" onClick={close} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
