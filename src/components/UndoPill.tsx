import { Button } from './Button';

export function UndoPill({ label, onUndo }: { label: string; onUndo: () => void }) {
  return <Button variant="secondary" size="lg" icon="undo-2" onClick={onUndo}>{label}</Button>;
}
