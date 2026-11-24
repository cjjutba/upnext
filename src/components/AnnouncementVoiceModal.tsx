import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';

export function AnnouncementVoiceModal({ voices, voiceURI, enabled, onSelect, onPreview, onClose }: {
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  enabled: boolean;
  onSelect: (uri: string) => void;
  onPreview: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savedVoiceMissing = voiceURI !== '' && !voices.some((voice) => voice.voiceURI === voiceURI);
  const status = voices.length === 0
    ? 'No device voice is available yet.'
    : savedVoiceMissing ? 'Using Automatic until your saved voice is available.' : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="announcement-voice"
      aria-labelledby="announcement-voice-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      style={{
        width: '420px', maxWidth: 'calc(100% - 2 * var(--space-4))',
        padding: 0, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-modal)', boxShadow: 'var(--shadow-modal)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        <h2 id="announcement-voice-title" className="display" style={{ margin: 0, fontSize: 'var(--text-h2)' }}>Announcement voice</h2>
        <IconButton icon="x" ariaLabel="Close announcement voice" onClick={close} />
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
        <label className="micro-label" htmlFor="announcement-voice-select">Device voice</label>
        <select
          id="announcement-voice-select"
          value={voiceURI}
          onChange={(event) => onSelect(event.target.value)}
          aria-describedby="announcement-voice-status"
          style={{
            width: '100%', minHeight: 'var(--tap-min)', padding: '0 var(--space-2)',
            color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-control)', font: '500 16px var(--font-sans)',
          }}
        >
          <option value="">Automatic</option>
          {savedVoiceMissing ? <option value={voiceURI} disabled>Saved voice unavailable</option> : null}
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>
          ))}
        </select>
        <p id="announcement-voice-status" role="status" className="micro-label" style={{ margin: 0 }}>
          {[status, !enabled ? 'Announcements are muted.' : null].filter(Boolean).join(' ')}
        </p>
        <Button variant="secondary" icon="volume-2" disabled={!enabled || voices.length === 0} onClick={onPreview}>
          Preview
        </Button>
      </div>
    </dialog>
  );
}
