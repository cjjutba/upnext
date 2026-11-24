import { AppDialog } from './AppDialog';
import { Button } from './Button';
import { IconButton } from './IconButton';

export function AnnouncementVoiceModal({ voiceAvailable, enabled, onPreview, onClose }: {
  voiceAvailable: boolean;
  enabled: boolean;
  onPreview: () => void;
  onClose: () => void;
}) {
  const status = !voiceAvailable
    ? 'Daniel, English (UK), is unavailable on this device. Announcements are silent.'
    : enabled ? 'Daniel, English (UK)' : 'Daniel, English (UK). Announcements are muted.';

  return (
    <AppDialog label="Announcement voice" descriptionId="announcement-voice-status" onClose={onClose} width="420px">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
        <h2 id="announcement-voice-title" className="display" style={{ margin: 0, fontSize: 'var(--text-h2)' }}>Announcement voice</h2>
        <IconButton icon="x" ariaLabel="Close announcement voice" onClick={onClose} />
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
        <p id="announcement-voice-status" role="status" style={{ margin: 0, color: 'var(--text-secondary)' }}>
          {status}
        </p>
        <Button variant="secondary" icon="volume-2" disabled={!enabled || !voiceAvailable} onClick={onPreview}>
          Preview
        </Button>
      </div>
    </AppDialog>
  );
}
