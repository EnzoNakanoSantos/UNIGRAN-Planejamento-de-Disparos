import type { BaseRule } from '../../types';
import { baseValidation, fmtDate } from '../../logic';

function BaseInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="baseRuleInfo">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

export function BaseTable({ bases, onEdit, onDelete }: {
  bases: BaseRule[];
  onEdit: (base: BaseRule) => void;
  onDelete: (id: string) => void;
}) {
  if (!bases.length) return <div className="empty">Nenhuma regra cadastrada.</div>;
  return (
    <div className="baseRuleGrid">
      {bases.map(base => {
        const validation = baseValidation(base);
        return (
          <article className="baseRuleCard" key={base.id}>
            <header>
              <div>
                <h3>{base.campaign || 'Sem campanha'}</h3>
                <p>{base.responsible || 'Sem responsável'} · Atualizada em {fmtDate(base.lastUpdated)}</p>
              </div>
              <span className={`validation ${validation.level}`} title={validation.issues.join(' | ')}>{validation.level === 'green' ? 'Atualizada' : validation.level === 'yellow' ? 'Revisar Base' : 'Risco'}</span>
            </header>

            <div className="baseRuleDetails">
              <BaseInfo label="Base de disparo" value={base.mainBase} />
              <BaseInfo label="Exclusões" value={base.excludedBases || 'Nenhuma exclusão'} />
              <BaseInfo label="Ação esperada" value={base.expectedAction} />
              <BaseInfo label="Arquivo Anexo" value={base.spreadsheetAttachment?.name || 'Nenhum arquivo'} />
            </div>

            {base.notes && <p className="baseRuleNotes">{base.notes}</p>}

            <footer>
              {base.spreadsheetAttachment ? (
                <a className="downloadLink" href={base.spreadsheetAttachment.dataUrl} download={base.spreadsheetAttachment.name}>Baixar base</a>
              ) : <span />}
              <div className="actions">
                <button onClick={() => onEdit(base)}>Editar</button>
                <button className="danger" onClick={() => onDelete(base.id)}>Remover</button>
              </div>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
