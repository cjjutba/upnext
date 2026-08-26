export function CountBadge({ value, title }: { value: number; title?: string }) {
  return (
    <span className="mono" title={title} aria-label={title} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: '28px', height: '28px', padding: '0 8px', borderRadius: 'var(--radius-full)',
      background: 'var(--gray-100)', color: 'var(--text-secondary)', fontSize: '14px',
    }}>
      {value}
    </span>
  );
}
