import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function RuleCard({ title, description, icon, selected, onSelect, badge }: {
  title: string; description: string; icon: IconName; selected: boolean; onSelect: () => void; badge?: ReactNode;
}) {
  return (
    <button
      type="button" className="action rule-choice" data-variant="secondary" onClick={onSelect} aria-pressed={selected}>
      <Icon name={icon} size={20} />
      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <span style={{ font: '600 16px/1.2 var(--font-sans)' }}>{title}</span>
          {badge}
        </span>
        <span style={{ font: '400 14px/1.4 var(--font-sans)', color: 'var(--text-secondary)' }}>{description}</span>
      </span>
    </button>
  );
}
