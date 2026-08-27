import { useEffect, useState } from 'react';
import { PlayerChip } from '../components/PlayerChip';
import { RuleCard } from '../components/RuleCard';
import { Stepper } from '../components/Stepper';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { Icon, type IconName } from '../components/Icon';
import { listSessions, type SessionListing } from '../db/eventStore';
import { MODES, templateForMode, type MatchingMode } from '../domain/modes';
import type { Player, RuleTemplate } from '../domain/types';

const MODE_ICON: Record<MatchingMode, IconName> = {
  balanced: 'shuffle',
  social: 'user-plus',
  classic: 'rotate-cw',
  winners: 'trophy',
};

export function RosterSetup({
  players, onAddPlayer, selected, onToggle, onStart, onResume, onImport,
  onSelectAll, onClearAll, returning, onCheckInReturning, onUpdatePlayer, narrow,
}: {
  players: Player[];
  onAddPlayer: (name: string) => void;
  selected: string[];
  onToggle: (playerId: string) => void;
  onStart: (config: { courts: number; template: RuleTemplate; winCap: number }) => void;
  onResume: (sessionId: string) => void;
  onImport: (file: File) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  returning: Player[];
  onCheckInReturning: () => void;
  onUpdatePlayer: (id: string, changes: { name?: string; rating?: number }) => void;
  /** Phone portrait: the Tonight card stacks under the roster. */
  narrow: boolean;
}) {
  const [name, setName] = useState('');
  const [courts, setCourts] = useState(2);
  const [mode, setMode] = useState<MatchingMode>('balanced');
  const [splitWinners, setSplitWinners] = useState(false);
  const [winCap, setWinCap] = useState(3);
  const [history, setHistory] = useState<SessionListing[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { void listSessions().then(setHistory); }, []);

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 420px', gap: 'var(--space-4)', padding: 'var(--space-4)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <span className="display" style={{ fontSize: 'var(--text-h1)' }}>Roster</span>
          <span className="mono" style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>{selected.length} checked in</span>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onSelectAll} disabled={players.length > 0 && selected.length === players.length}>Check in all</Button>
          {selected.length > 0 ? <Button variant="ghost" onClick={onClearAll}>Clear</Button> : null}
          <Button variant="ghost" onClick={() => { setEditing(!editing); setEditingId(null); }}>
            {editing ? 'Done editing' : 'Edit players'}
          </Button>
        </div>
        <form
          style={{ display: 'flex', gap: 'var(--space-2)' }}
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAddPlayer(name.trim()); setName(''); } }}>
          <input
            value={name} onChange={(e) => setName(e.target.value)} placeholder="Add player" aria-label="Player name"
            style={{
              flex: 1, height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
            }} />
          <Button variant="secondary" icon="user-plus" onClick={() => { if (name.trim()) { onAddPlayer(name.trim()); setName(''); } }}>Add</Button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {players.map((p) => (
            <PlayerChip
              key={p.id}
              name={p.name}
              selected={selected.includes(p.id)}
              onClick={() => (editing ? setEditingId(p.id) : onToggle(p.id))}
              rating={p.rating}
            />
          ))}
        </div>
        {editing && editingId ? (() => {
          const p = players.find((x) => x.id === editingId);
          if (!p) return null;
          return (
            <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)' }}>
              <input
                key={p.id + ':' + p.updatedAt} defaultValue={p.name} aria-label="Player name"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) onUpdatePlayer(p.id, { name: v }); }}
                style={{ height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)' }} />
              <div style={{ display: 'flex' }} role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={n + ' star rating'}
                    onClick={() => onUpdatePlayer(p.id, { rating: p.rating === n ? undefined : n })}
                    style={{ width: 'var(--tap-min)', height: 'var(--tap-min)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: (p.rating ?? 0) >= n ? 'var(--gray-1000)' : 'var(--gray-500)' }}>
                    <Icon name="star" size={20} />
                  </button>
                ))}
              </div>
              <Button variant="ghost" onClick={() => setEditingId(null)}>Done</Button>
            </div>
          );
        })() : null}
        <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-secondary)' }}>
          {editing ? 'Tap a name to edit.' : 'Tap a name to check in.'}
        </span>
        {returning.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span className="micro-label">Returning players ({returning.length})</span>
            <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-secondary)' }}>
              {returning.map((p) => p.name).join(', ')}
            </span>
            <Button variant="secondary" onClick={onCheckInReturning}>Check in returning</Button>
          </div>
        ) : null}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="micro-label" style={{ flex: 1 }}>Session history</span>
            <label style={{ font: '500 14px var(--font-sans)', color: 'var(--blue)', cursor: 'pointer' }}>
              Import session
              <input
                type="file" accept="application/json"
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', clipPath: 'inset(50%)' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
            </label>
          </div>
          {history.map((h) => (
            <div key={h.sessionId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
              <span style={{ font: '600 16px var(--font-sans)', flex: 1 }}>{fmtDate(h.startedAt)}</span>
              {h.endedAt === null ? <Button variant="ghost" onClick={() => onResume(h.sessionId)}>Resume</Button> : <span className="micro-label">Done</span>}
            </div>
          ))}
          {history.length === 0 ? <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-tertiary)' }}>No sessions yet.</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', padding: 'var(--space-4)' }}>
        <span className="display" style={{ fontSize: 'var(--text-h2)' }}>Tonight</span>
        <Stepper label="Courts" value={courts} min={1} max={8} onChange={setCourts} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="micro-label">Matching mode</span>
          {MODES.map((m) => (
            <RuleCard
              key={m.id}
              title={m.label}
              description={m.description}
              icon={MODE_ICON[m.id]}
              selected={mode === m.id}
              onSelect={() => setMode(m.id)}
              badge={m.recommended ? <StatusBadge status="live" label="Recommended" /> : undefined}
            />
          ))}
          {mode === 'winners' ? (
            <>
              <Stepper label="Win cap" value={winCap} min={1} max={5} unit="games" onChange={setWinCap} />
              <Button
                variant={splitWinners ? 'primary' : 'secondary'}
                onClick={() => setSplitWinners(!splitWinners)}
                ariaLabel="Toggle split winners">
                {splitWinners ? 'Split winners: on' : 'Split winners: off'}
              </Button>
            </>
          ) : null}
        </div>
        <Button
          size="lg" block icon="play" disabled={selected.length < 4}
          onClick={() => onStart({ courts, template: templateForMode(mode, splitWinners), winCap })}>
          Start session
        </Button>
        {selected.length < 4 ? <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-secondary)', textAlign: 'center' }}>Check in at least 4 players</span> : null}
      </div>
    </div>
  );
}
