import { useCallback, useEffect, useState } from 'react';
import { db } from '../db/db';
import type { Player } from '../domain/types';

export function useRoster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const refresh = useCallback(async () => {
    const all = await db.players.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setPlayers(all);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const addPlayer = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const all = await db.players.toArray();
    // names identify players on every screen, so duplicates would be indistinguishable
    if (all.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    const now = Date.now();
    await db.players.put({ id: crypto.randomUUID(), name: trimmed, createdAt: now, updatedAt: now });
    await refresh();
  }, [refresh]);
  return { players, addPlayer, refresh };
}
