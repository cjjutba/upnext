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
  players, onAddPlayer, selected, onToggle, onStart, onResume, onReopen, onView, onImport,
  onSelectAll, onClearAll, returning, onCheckInReturning, onUpdatePlayer, importError, importing, narrow,
}: {
  players: Player[];
  onAddPlayer: (name: string) => void;
  selected: string[];
  onToggle: (playerId: string) => void;
  onStart: (config: { courts: number; template: RuleTemplate; winCap: number }) => void;
  onResume: (sessionId: string) => void;
  onReopen: (sessionId: string) => void;
  onView: (sessionId: string) => void;
  onImport: (file: File) => void;
  importError: string | null;
  importing: boolean;
  onSelectAll: () => void;
  onClearAll: () => void;
  returning: Player[];
  onCheckInReturning: () => void;
  onUpdatePlayer: (id: string, changes: { name?: string; rating?: number }) => void;
  /** Phone portrait: the Tonight card stacks under the roster. */
  narrow: boolean;
}) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
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
    <main id="app-main" tabIndex={-1} className={narrow ? 'setup-layout setup-layout--narrow' : 'setup-layout'}>
      <header className="setup-intro">
        <h1 className="display">Open play setup</h1>
        <p>Check players in, choose your courts, and start the session.</p>
      </header>
      <section className="setup-panel setup-roster" aria-labelledby="roster-title">
        <div className="panel-heading">
          <h2 id="roster-title" className="display">Roster</h2>
          <span className="count-label mono">{selected.length} checked in</span>
        </div>
        <div className="setup-roster-actions">
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
            name="player-name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add player" aria-label="Player name"
            style={{
              flex: 1, minWidth: 0, height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
            }} />
          <Button variant="secondary" icon="user-plus" onClick={() => { if (name.trim()) { onAddPlayer(name.trim()); setName(''); } }}>Add</Button>
        </form>
        {players.length > 12 ? (
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players" aria-label="Search players"
            style={{
              height: 'var(--tap-min)', padding: '0 var(--space-3)', font: '400 16px var(--font-sans)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', background: 'var(--bg)', color: 'var(--text)',
            }} />
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {players.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).map((p) => (
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
              <div style={{ display: 'flex' }} role="group" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className="action rating-choice" data-variant="ghost" data-size="icon"
                    aria-label={n + ' star rating'} aria-pressed={p.rating === n} data-filled={(p.rating ?? 0) >= n || undefined}
                    onClick={() => onUpdatePlayer(p.id, { rating: p.rating === n ? undefined : n })}>
                    <Icon name="star" size={20} />
                  </button>
                ))}
              </div>
              <Button variant="ghost" onClick={() => setEditingId(null)}>Done</Button>
            </div>
          );
        })() : null}
        <p className="setup-hint">
          {players.length === 0 ? 'Add the first player to build your roster.' : editing ? 'Tap a name to edit.' : 'Tap a name to check in.'}
        </p>
        {returning.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <span className="micro-label">Returning players ({returning.length})</span>
            <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-secondary)' }}>
              {returning.map((p) => p.name).join(', ')}
            </span>
            <Button variant="secondary" onClick={onCheckInReturning}>Check in returning</Button>
          </div>
        ) : null}
      </section>
      <section className="setup-panel setup-settings" aria-labelledby="setup-title">
        <h2 id="setup-title" className="display">Session settings</h2>
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
                variant="secondary" pressed={splitWinners}
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
      </section>
      <section className="setup-panel setup-history" aria-labelledby="history-title">
        <div className="panel-heading">
          <h2 id="history-title" className="display">Session history</h2>
          <label className="action import-control" data-variant="secondary">
            Import session
            <input
              type="file" accept=".json,application/json" disabled={importing}
              style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', clipPath: 'inset(50%)' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          </label>
        </div>
        {importing ? <p role="status" className="app-notice">Importing session…</p> : null}
        {importError ? <p role="alert" className="app-notice" data-kind="error">{importError}</p> : null}
        {history.map((h, i) => (
          <div key={h.sessionId} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)', padding: '0 var(--space-3)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
            <span style={{ fontWeight: 600, flex: 1 }}>{fmtDate(h.startedAt)}</span>
            {h.endedAt === null ? (
              <Button variant="ghost" onClick={() => onResume(h.sessionId)}>Resume</Button>
            ) : (
              <>
                {/* only the newest session can reopen: reviving an older one would race the night's real log */}
                {i === 0 ? <Button variant="ghost" onClick={() => onReopen(h.sessionId)}>Reopen</Button> : null}
                <Button variant="ghost" onClick={() => onView(h.sessionId)}>View</Button>
              </>
            )}
          </div>
        ))}
        {history.length === 0 ? <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-tertiary)' }}>No sessions yet.</span> : null}
      </section>
    </main>
  );
}
