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
    const now = Date.now();
    await db.players.put({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now });
    await refresh();
  }, [refresh]);
  return { players, addPlayer, refresh };
}
