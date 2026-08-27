import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const addPlayer = useCallback(async (name: string): Promise<Player | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    // names identify players on every screen, so duplicates would be indistinguishable
    const all = await db.players.toArray();
    if (all.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return null;
    const now = Date.now();
    const player: Player = { id: crypto.randomUUID(), name: trimmed, createdAt: now, updatedAt: now };
    await db.players.put(player);
    await refresh();
    return player;
  }, [refresh]);

  /** A colliding rename is refused, but a rating change in the same call always lands. */
  const updatePlayer = useCallback(async (id: string, changes: { name?: string; rating?: number }) => {
    const existing = await db.players.get(id);
    if (!existing) return;
    let name = changes.name?.trim();
    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      const all = await db.players.toArray();
      if (all.some((p) => p.id !== id && p.name.toLowerCase() === name!.toLowerCase())) name = undefined;
    }
    await db.players.put({
      ...existing,
      ...(name ? { name } : {}),
      ...('rating' in changes ? { rating: changes.rating } : {}),
      updatedAt: Date.now(),
    });
    await refresh();
  }, [refresh]);

  const ratings = useMemo(() => {
    const out: Record<string, number | undefined> = {};
    for (const p of players) out[p.id] = p.rating;
    return out;
  }, [players]);

  return { players, addPlayer, updatePlayer, refresh, ratings };
}
