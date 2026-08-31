import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, Copy, Edit, MoreVertical, Send, Trash2 } from 'lucide-react';
import type { BaseRule, Dispatch, DispatchStatus } from '../../types';
import { dispatchValidation, fmtDate } from '../../logic';
import { dispatchDisplayName, dispatchTime, duplicateNameCount } from '../../utils/app';
import { StatusSelect } from '../../components/forms/Controls';
import { ValidationBadge } from '../../components/feedback/ValidationBadge';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function DispatchTable({ dispatches, bases, overlaps, duplicateNames, onView, onEdit, onDuplicate, onSyncCalendar, onRemoveCalendar, onDelete, onStatus }: {
  dispatches: Dispatch[];
  bases: BaseRule[];
  overlaps: Map<string, Dispatch[]>;
  duplicateNames: Map<string, Dispatch[]>;
  onView: (dispatch: Dispatch) => void;
  onEdit: (dispatch: Dispatch) => void;
  onDuplicate: (dispatch: Dispatch) => void;
  onSyncCalendar: (dispatch: Dispatch) => void;
  onRemoveCalendar: (dispatch: Dispatch) => void;
  onDelete: (ids: string[]) => Promise<void> | void;
  onStatus: (id: string, status: DispatchStatus) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const selectedSet = new Set(selected);
  const totalPages = Math.max(1, Math.ceil(dispatches.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const visibleDispatches = dispatches.slice(startIndex, endIndex);

  useEffect(() => {
    setSelected(current => current.filter(id => dispatches.some(dispatch => dispatch.id === id)));
  }, [dispatches]);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(dispatches.length / pageSize))));
  }, [dispatches.length, pageSize]);

  useEffect(() => {
    if (!actionMenu) return undefined;
    function closeMenu() {
      setActionMenu(null);
    }
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [actionMenu]);

  function toggleSelected(id: string, checked: boolean) {
    setConfirming(false);
    setActionMenu(null);
    setSelected(current => checked ? [...new Set([...current, id])] : current.filter(item => item !== id));
  }

  function toggleAll(checked: boolean) {
    setConfirming(false);
    setActionMenu(null);
    setSelected(checked ? visibleDispatches.map(dispatch => dispatch.id) : []);
  }

  async function confirmDelete() {
    await onDelete(selected);
    setSelected([]);
    setConfirming(false);
  }

  if (!dispatches.length) return <div className="empty">Nenhum disparo encontrado.</div>;
  return (
    <div className="dispatchList">
      <div className="paginationBar">
        <div className="paginationSummary">
          <strong>{dispatches.length}</strong> disparo(s) encontrado(s)
          <span>Mostrando {startIndex + 1}-{Math.min(endIndex, dispatches.length)}</span>
        </div>
        <label className="pageSizeControl">
          <span>Por página</span>
          <select
            value={pageSize}
            onChange={event => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="dispatchBulk">
        <label>
          <input
            type="checkbox"
            checked={visibleDispatches.length > 0 && visibleDispatches.every(dispatch => selectedSet.has(dispatch.id))}
            onChange={event => toggleAll(event.target.checked)}
          />
          Selecionar página
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
            {visibleDispatches.map(dispatch => {
              const validation = dispatchValidation(dispatch, bases);
              const conflicts = overlaps.get(dispatch.id) || [];
              const duplicateCount = duplicateNameCount(dispatch, duplicateNames);
              const displayName = dispatchDisplayName(dispatch);
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
                  <td><span className="date">{fmtDate(dispatch.date)}</span></td>
                  <td><span className="dispatchCellText">{dispatchTime(dispatch.time)}</span></td>
                  <td>
                    <div className="dispatchNameCell">
                    <strong>{displayName || 'Sem nome'}</strong>
                    <span className="pill">{dispatch.campaign || 'Sem campanha'}</span>
                    <small>{dispatch.responsible || 'Sem responsável'}</small>
                    </div>
                  </td>
                  <td><span className="dispatchCellText">{dispatch.audience || '-'}</span></td>
                  <td onClick={event => event.stopPropagation()}>
                    <div className="dispatchStatusCell">
                      <StatusSelect value={dispatch.status} onChange={value => onStatus(dispatch.id, value)} />
                    </div>
                  </td>
                  <td>
                    <div className="dispatchValidationCell">
                      <ValidationBadge validation={validation} />
                    {conflicts.length > 0 && <small className="overlap">Sobreposição com {conflicts.length} disparo(s)</small>}
                      {duplicateCount > 0 && <small className="duplicateName">Mesmo nome em {duplicateCount} disparo(s)</small>}
                    </div>
                  </td>
                  <td onClick={event => event.stopPropagation()}>
                    <div className="actions dispatchActionsCell">
                      <button onClick={() => onEdit(dispatch)}><Edit className="actionIcon" />Editar</button>
                      <button onClick={() => onDuplicate(dispatch)}><Copy className="actionIcon" />Duplicar</button>
                      <div className="rowActionMenu">
                      <button
                        type="button"
                        className="rowActionMenuButton"
                        aria-label="Mais ações"
                        aria-expanded={actionMenu?.id === dispatch.id}
                        onClick={event => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          setActionMenu(current => current?.id === dispatch.id
                            ? null
                            : {
                              id: dispatch.id,
                              top: rect.bottom + 6,
                              left: Math.max(12, Math.min(rect.right - 190, window.innerWidth - 202))
                            });
                        }}
                      >
                        <MoreVertical className="actionIcon" />
                      </button>
                      {actionMenu?.id === dispatch.id && (
                        <div className="rowActionMenuPanel floating" style={{ top: actionMenu.top, left: actionMenu.left }}>
                          {dispatch.status !== 'Enviado' && (
                            <button type="button" onClick={() => {
                              setActionMenu(null);
                              onStatus(dispatch.id, 'Enviado');
                            }}><Send className="actionIcon" />Marcar como enviado</button>
                          )}
                          <button type="button" disabled={dispatch.status !== 'Pronto para disparo'} onClick={() => {
                            setActionMenu(null);
                            onSyncCalendar(dispatch);
                          }}><CalendarCheck className="actionIcon" />Sincronizar Calendar</button>
                          <button type="button" onClick={() => {
                            setActionMenu(null);
                            onRemoveCalendar(dispatch);
                          }}><CalendarX className="actionIcon" />Remover do Calendar</button>
                          <button type="button" className="danger" onClick={() => {
                            setActionMenu(null);
                            setSelected([dispatch.id]);
                            setConfirming(true);
                          }}><Trash2 className="actionIcon" />Excluir</button>
                        </div>
                      )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="paginationFooter">
        <button type="button" className="btn ghost small" disabled={currentPage === 1} onClick={() => setPage(1)}>Primeira</button>
        <button type="button" className="btn ghost small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
        <span>Página {currentPage} de {totalPages}</span>
        <button type="button" className="btn ghost small" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Próxima</button>
        <button type="button" className="btn ghost small" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Última</button>
      </div>
    </div>
  );
}
