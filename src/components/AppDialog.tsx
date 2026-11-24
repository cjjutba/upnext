import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function AppDialog({ label, descriptionId, onClose, busy, dismissOnBackdrop = true, width = '520px', children }: {
  label: string;
  descriptionId?: string;
  onClose: () => void;
  busy?: boolean;
  dismissOnBackdrop?: boolean;
  width?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = () => {
    if (busy) return;
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="app-dialog" aria-label={label} aria-describedby={descriptionId} style={{ width }}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (dismissOnBackdrop && event.target === event.currentTarget) close(); }}>
      <div className="app-dialog-inner">{children}</div>
    </dialog>
  );
}
