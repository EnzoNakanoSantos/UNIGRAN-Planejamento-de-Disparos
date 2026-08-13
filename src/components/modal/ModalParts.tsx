import type { ReactNode } from 'react';

export function Field({ label, wide, asGroup = false, children }: { label: string; wide?: boolean; asGroup?: boolean; children: ReactNode }) {
  const className = `field ${wide ? 'wide' : ''}`;
  if (asGroup) return <div className={className}><span>{label}</span>{children}</div>;
  return <label className={className}><span>{label}</span>{children}</label>;
}

export function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="modalHead"><h2>{title}</h2><button type="button" onClick={onClose}>Fechar</button></div>;
}

export function ModalFoot({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return (
    <div className="modalFoot">
      <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
    </div>
  );
}


