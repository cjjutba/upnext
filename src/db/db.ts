import Dexie, { type Table } from 'dexie';
import type { Player, SessionEvent } from '../domain/types';

export interface MetaRow {
  key: string;
  value: number | string;
}

export class UpnextDB extends Dexie {
  players!: Table<Player, string>;
  sessionEvents!: Table<SessionEvent, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'upnext') {
    super(name);
    this.version(1).stores({
      players: 'id, name, createdAt',
      sessionEvents: 'id, sessionId, type, [type+sessionId], [sessionId+seq]',
      meta: 'key',
    });
  }
}

export const db = new UpnextDB();
