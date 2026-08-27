import {
  Play, Square, Undo2, Plus, Minus, UserPlus, X, Share2, Clock,
  MoreVertical, RotateCw, Trophy, Shuffle, Download, Star, Sun, Moon,
} from 'lucide-react';
import type { ComponentType } from 'react';

const icons = {
  play: Play, square: Square, 'undo-2': Undo2, plus: Plus, minus: Minus,
  'user-plus': UserPlus, x: X, 'share-2': Share2, clock: Clock,
  'more-vertical': MoreVertical, 'rotate-cw': RotateCw, trophy: Trophy,
  shuffle: Shuffle, download: Download, star: Star, sun: Sun, moon: Moon,
} satisfies Record<string, ComponentType<{ size?: number; strokeWidth?: number }>>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const C = icons[name];
  return <C size={size} strokeWidth={1.5} aria-hidden />;
}
