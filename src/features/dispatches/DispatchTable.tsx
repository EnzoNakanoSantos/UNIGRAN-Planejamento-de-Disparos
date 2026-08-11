import { useEffect, useState } from 'react';
import type { BaseRule, Dispatch, DispatchStatus } from '../../types';
import { dispatchValidation, fmtDate } from '../../logic';
import { dispatchTime, duplicateNameCount } from '../../utils/app';
import { StatusSelect } from '../../components/forms/Controls';
import { ValidationBadge } from '../../components/feedback/ValidationBadge';

export function DispatchTable({ dispatches, bases, overlaps, duplicateNames, onView, onEdit, onDelete, onStatus }: {
  dispatches: Dispatch[];
  bases: BaseRule[];
  overlaps: Map<string, Dispatch[]>;
  duplicateNames: Map<string, Dispatch[]>;
  onView: (dispatch: Dispatch) => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (ids: string[]) => Promise<void> | void;
  onStatus: (id: string, status: DispatchStatus) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const selectedSet = new Set(selected);

  useEffect(() => {
    setSelected(current => current.filter(id => dispatches.some(dispatch => dispatch.id === id)));
  }, [dispatches]);

  function toggleSelected(id: string, checked: boolean) {
    setConfirming(false);
    setSelected(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id));
  }

  function toggleAll(checked: boolean) {
    setConfirming(false);
    setSelected(checked ? dispatches.map(dispatch => dispatch.id) : []);
  }

  async function confirmDelete() {
    await onDelete(selected);
    setSelected([]);
    setConfirming(false);
  }

  if (!dispatches.length) return <div className="empty">Nenhum disparo encontrado.</div>;
  return (
    <div className="dispatchList">
      <div className="dispatchBulk">
        <label>
          <input
            type="checkbox"
            checked={selected.length === dispatches.length}
            onChange={event => toggleAll(event.target.checked)}
          />
          Selecionar todos
        </label>
        <button type="button" className="btn dangerSoft small" disabled={!selected.length} onClick={() => setConfirming(true)}>
          Remover selecionados
        </button>
      </div>
      {confirming && (
        <div className="confirmStrip dispatchConfirm">
          <strong>Remover {selected.length} disparo(s)?</strong>
          <span>Essa ação remove os disparos selecionados do planejamento e salva no Supabase.</span>
          <div>
            <button type="button" className="btn ghost small" onClick={() => setConfirming(false)}>Cancelar</button>
            <button type="button" className="btn dangerStrong small" onClick={confirmDelete}>Confirmar exclusão</button>
          </div>
        </div>
      )}
      <div className="tableWrap">
        <table className="dispatchTable">
          <colgroup>
            <col className="colSelect" />
            <col className="colDate" />
            <col className="colTime" />
            <col className="colCampaign" />
            <col className="colAudience" />
            <col className="colStatus" />
            <col className="colValidation" />
            <col className="colActions" />
          </colgroup>
          <thead>
            <tr>
              <th></th>
              <th>Data de disparo</th>
              <th>Hora</th>
              <th>Campanha</th>
              <th>Público</th>
              <th>Status</th>
              <th>Validação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map(dispatch => {
              const validation = dispatchValidation(dispatch, bases);
              const conflicts = overlaps.get(dispatch.id) || [];
              const duplicateCount = duplicateNameCount(dispatch, duplicateNames);
              return (
                <tr
                  className="clickableRow"
                  key={dispatch.id}
                  tabIndex={0}
                  onClick={() => onView(dispatch)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') onView(dispatch);
                  }}
                >
                  <td className="selectCell" onClick={event => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(dispatch.id)}
                      onChange={event => toggleSelected(dispatch.id, event.target.checked)}
                    />
                  </td>
                  <td className="date">{fmtDate(dispatch.date)}</td>
                  <td>{dispatchTime(dispatch.time)}</td>
                  <td><span className="pill">{dispatch.campaign || 'Sem campanha'}</span><small>{dispatch.responsible || 'Sem responsável'}</small></td>
                  <td>{dispatch.audience || '-'}</td>
                  <td onClick={event => event.stopPropagation()}><StatusSelect value={dispatch.status} onChange={value => onStatus(dispatch.id, value)} /></td>
                  <td>
                    <ValidationBadge validation={validation} />
                    {conflicts.length > 0 && <small className="overlap">Sobreposição com {conflicts.length} disparo(s)</small>}
                    {duplicateCount > 0 && <small className="duplicateName">Mesmo nome em {duplicateCount} disparo(s)</small>}
                  </td>
                  <td className="actions" onClick={event => event.stopPropagation()}>
                    {dispatch.status !== 'Enviado' && (
                      <button className="sentQuickAction" onClick={() => onStatus(dispatch.id, 'Enviado')}>Enviado</button>
                    )}
                    <button onClick={() => onEdit(dispatch)}>Editar</button>
                    <button className="danger" onClick={() => {
                      setSelected([dispatch.id]);
                      setConfirming(true);
                    }}>Excluir</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

