import type { BaseRule } from '../../types';
import { baseValidation, fmtDate } from '../../logic';
import { ValidationBadge } from '../../components/feedback/ValidationBadge';

export function BaseTable({ bases, onEdit, onDelete }: {
  bases: BaseRule[];
  onEdit: (base: BaseRule) => void;
  onDelete: (id: string) => void;
}) {
  if (!bases.length) return <div className="empty">Nenhuma regra cadastrada.</div>;
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Campanha</th>
            <th>Base principal</th>
            <th>Ação esperada</th>
            <th>Atualização</th>
            <th>Responsável</th>
            <th>Validação</th>
            <th>Planilha</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {bases.map(base => (
            <tr key={base.id}>
              <td><span className="pill">{base.campaign || 'Sem campanha'}</span></td>
              <td>{base.mainBase}</td>
              <td>{base.expectedAction}</td>
              <td>{fmtDate(base.lastUpdated)}</td>
              <td>{base.responsible}</td>
              <td><ValidationBadge validation={baseValidation(base)} /></td>
              <td>
                {base.spreadsheetAttachment ? (
                  <a className="downloadLink" href={base.spreadsheetAttachment.dataUrl} download={base.spreadsheetAttachment.name}>Baixar</a>
                ) : '-'}
              </td>
              <td className="actions"><button onClick={() => onEdit(base)}>Editar</button><button className="danger" onClick={() => onDelete(base.id)}>Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

