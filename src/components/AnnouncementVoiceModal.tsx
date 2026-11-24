import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { IconButton } from './IconButton';

export function AnnouncementVoiceModal({ voiceAvailable, enabled, onPreview, onClose }: {
  voiceAvailable: boolean;
  enabled: boolean;
  onPreview: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const status = !voiceAvailable
    ? 'Daniel, English (UK), is unavailable on this device. Announcements are silent.'
    : enabled ? 'Daniel, English (UK)' : 'Daniel, English (UK). Announcements are muted.';

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
      aria-describedby="announcement-voice-status"
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
        <p id="announcement-voice-status" role="status" style={{ margin: 0, color: 'var(--text-secondary)' }}>
          {status}
        </p>
        <Button variant="secondary" icon="volume-2" disabled={!enabled || !voiceAvailable} onClick={onPreview}>
          Preview
        </Button>
      </div>
    </dialog>
  );
}
