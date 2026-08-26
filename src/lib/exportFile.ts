import { exportSession, importSession, type SessionExport } from '../db/eventStore';

/** Web Share with files when available, otherwise a plain download. */
export async function shareSessionFile(sessionId: string): Promise<void> {
  const dump = await exportSession(sessionId);
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File([JSON.stringify(dump)], `upnext-${stamp}.json`, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: 'upnext session' });
      return;
    } catch {
      // user canceled or share failed: fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSessionFile(file: File): Promise<void> {
  const data = JSON.parse(await file.text()) as SessionExport;
  await importSession(data);
}
