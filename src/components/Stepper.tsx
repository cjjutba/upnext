import { Icon } from './Icon';

export function Stepper({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  const btn = (name: 'minus' | 'plus', delta: number, disabled: boolean) => (
    <button
      type="button" disabled={disabled} onClick={() => onChange(value + delta)}
      aria-label={`${label} ${name === 'plus' ? 'up' : 'down'}`}
      style={{
        width: 'var(--tap-min)', height: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, color: 'var(--text)',
      }}>
      <Icon name={name} size={20} />
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span style={{ font: '500 16px var(--font-sans)', flex: 1 }}>{label}</span>
      {btn('minus', -1, value <= min)}
      <span className="mono" style={{ fontSize: '20px', minWidth: '56px', textAlign: 'center' }}>
        {value}{unit ? ` ${unit}` : ''}
      </span>
      {btn('plus', 1, value >= max)}
    </div>
  );
}
