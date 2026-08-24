import type { ReactNode } from 'react';

export function Field({ label, wide, asGroup = false, children }: { label: string; wide?: boolean; asGroup?: boolean; children: ReactNode }) {
  const className = `field ${wide ? 'wide' : ''}`;
  if (asGroup) return <div className={className}><span>{label}</span>{children}</div>;
  return <label className={className}><span>{label}</span>{children}</label>;
}

export function ModalHead({ title, eyebrow, onClose }: { title: string; eyebrow?: string; onClose: () => void }) {
  return (
    <div className="modalHead">
      <div>
        {eyebrow && <small>{eyebrow}</small>}
        <h2>{title}</h2>
      </div>
      <button type="button" onClick={onClose}>Fechar</button>
    </div>
  );
}

export function ModalFoot({ saving, onClose, submitLabel = 'Salvar' }: { saving: boolean; onClose: () => void; submitLabel?: string }) {
  return (
    <div className="modalFoot">
      <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn primary" disabled={saving}>{saving ? 'Salvando...' : submitLabel}</button>
    </div>
  );
}

export function ConfirmDialog({
  title,
  text,
  safeLabel,
  confirmLabel,
  onSafe,
  onConfirm
}: {
  title: string;
  text: string;
  safeLabel: string;
  confirmLabel: string;
  onSafe: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modalBackdrop confirmDialogBackdrop" onMouseDown={onSafe}>
      <div
        className="confirmDialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-text"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="confirmDialogIcon" aria-hidden="true">!</div>
        <div className="confirmDialogContent">
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-text">{text}</p>
        </div>
        <div className="confirmDialogActions">
          <button type="button" className="btn primary" onClick={onSafe}>{safeLabel}</button>
          <button type="button" className="btn dangerStrong" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
