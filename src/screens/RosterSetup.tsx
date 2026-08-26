import { useEffect, useState } from 'react';
import { PlayerChip } from '../components/PlayerChip';
import { RuleCard } from '../components/RuleCard';
import { Stepper } from '../components/Stepper';
import { Button } from '../components/Button';
import { listSessions, type SessionListing } from '../db/eventStore';
import type { Player, RuleTemplate } from '../domain/types';

const RULES: { id: RuleTemplate; title: string; desc: string; icon: 'rotate-cw' | 'trophy' | 'shuffle' }[] = [
  { id: 'all-off', title: 'All four off', desc: 'Game ends, all four rejoin the back of the queue.', icon: 'rotate-cw' },
  { id: 'winners-stay', title: 'Winners stay', desc: 'Winning pair stays on; next two challenge.', icon: 'trophy' },
  { id: 'winners-split', title: 'Winners split', desc: 'Winners split up and each anchors a new pair.', icon: 'shuffle' },
];

export function RosterSetup({ players, onAddPlayer, selected, onToggle, onStart, onResume, onImport }: {
  players: Player[];
  onAddPlayer: (name: string) => void;
  selected: string[];
  onToggle: (playerId: string) => void;
  onStart: (config: { courts: number; template: RuleTemplate; winCap: number }) => void;
  onResume: (sessionId: string) => void;
  onImport: (file: File) => void;
}) {
  const [name, setName] = useState('');
  const [courts, setCourts] = useState(2);
  const [template, setTemplate] = useState<RuleTemplate>('all-off');
  const [winCap, setWinCap] = useState(3);
  const [history, setHistory] = useState<SessionListing[]>([]);
  useEffect(() => { void listSessions().then(setHistory); }, []);

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 'var(--space-4)', padding: 'var(--space-4)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <span className="display" style={{ fontSize: 'var(--text-h1)' }}>Roster</span>
          <span className="mono" style={{ fontSize: '16px', color: 'var(--text-secondary)' }}>{selected.length} checked in</span>
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
          {players.map((p) => <PlayerChip key={p.id} name={p.name} selected={selected.includes(p.id)} onClick={() => onToggle(p.id)} />)}
        </div>
        <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-secondary)' }}>Tap a name to check in.</span>
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
          <span className="micro-label">House rule</span>
          {RULES.map((r) => <RuleCard key={r.id} title={r.title} description={r.desc} icon={r.icon} selected={template === r.id} onSelect={() => setTemplate(r.id)} />)}
        </div>
        {template !== 'all-off' ? <Stepper label="Win cap" value={winCap} min={1} max={5} unit="games" onChange={setWinCap} /> : null}
        <Button size="lg" block icon="play" disabled={selected.length < 4} onClick={() => onStart({ courts, template, winCap })}>Start session</Button>
        {selected.length < 4 ? <span style={{ font: '400 14px var(--font-sans)', color: 'var(--text-secondary)', textAlign: 'center' }}>Check in at least 4 players</span> : null}
      </div>
    </div>
  );
}
