import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { fmtDate } from '../../logic';
import { isoDate, unique } from '../../utils/app';
import { ConfirmDialog } from '../../components/modal/ModalParts';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function CatalogManager({ title, description, values, dates, onAdd, onUpdate, onRemove }: {
  title: string;
  description: string;
  values: string[];
  dates: Record<string, { createdAt: string; updatedAt: string }>;
  onAdd: (value: string) => void;
  onUpdate: (oldValue: string, newValue: string) => void;
  onRemove: (values: string[]) => Promise<void> | void;
}) {
  const [newValue, setNewValue] = useState('');
  const [editing, setEditing] = useState('');
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'updated-desc' | 'updated-asc'>('name-asc');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [updatedFrom, setUpdatedFrom] = useState('');
  const [updatedTo, setUpdatedTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const selectedSet = new Set(selected);

  const visibleValues = useMemo(() => {
    const search = query.trim().toLowerCase();
    return values
      .filter(value => {
        const createdAt = isoDate(dates[value]?.createdAt || '');
        const updatedAt = isoDate(dates[value]?.updatedAt || '');
        if (search && !value.toLowerCase().includes(search)) return false;
        if (createdFrom && createdAt < createdFrom) return false;
        if (createdTo && createdAt > createdTo) return false;
        if (updatedFrom && updatedAt < updatedFrom) return false;
        if (updatedTo && updatedAt > updatedTo) return false;
        return true;
      })
      .sort((a, b) => {
        if (order === 'name-desc') return b.localeCompare(a, 'pt-BR');
        if (order === 'created-desc') return isoDate(dates[b]?.createdAt || '').localeCompare(isoDate(dates[a]?.createdAt || ''));
        if (order === 'created-asc') return isoDate(dates[a]?.createdAt || '').localeCompare(isoDate(dates[b]?.createdAt || ''));
        if (order === 'updated-desc') return isoDate(dates[b]?.updatedAt || '').localeCompare(isoDate(dates[a]?.updatedAt || ''));
        if (order === 'updated-asc') return isoDate(dates[a]?.updatedAt || '').localeCompare(isoDate(dates[b]?.updatedAt || ''));
        return a.localeCompare(b, 'pt-BR');
      });
  }, [createdFrom, createdTo, dates, order, query, updatedFrom, updatedTo, values]);

  const totalPages = Math.max(1, Math.ceil(visibleValues.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedValues = visibleValues.slice(startIndex, endIndex);
  const datalistId = `catalog-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, '-')}`;

  useEffect(() => {
    setSelected(current => current.filter(item => values.includes(item)));
  }, [values]);

  useEffect(() => {
    setPage(current => Math.min(current, Math.max(1, Math.ceil(visibleValues.length / pageSize))));
  }, [pageSize, visibleValues.length]);

  function submitNew(event: FormEvent) {
    event.preventDefault();
    onAdd(newValue);
    setNewValue('');
    setPage(1);
  }

  function startEdit(value: string) {
    setEditing(value);
    setDraft(value);
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    onUpdate(editing, draft);
    setEditing('');
    setDraft('');
  }

  function toggleSelected(value: string, checked: boolean) {
    setConfirming(false);
    setSelected(current => checked ? unique([...current, value]) : current.filter(item => item !== value));
  }

  function toggleAll(checked: boolean) {
    setConfirming(false);
    setSelected(checked ? paginatedValues : []);
  }

  async function confirmRemove() {
    await onRemove(selected);
    setSelected([]);
    setConfirming(false);
  }

  return (
    <div className="catalogCard">
      <div className="catalogHead">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span>{values.length}</span>
      </div>
      <form className="catalogForm" onSubmit={submitNew}>
        <input value={newValue} placeholder="Novo cadastro" onChange={event => setNewValue(event.target.value)} />
        <button className="btn primary" disabled={!newValue.trim()}>Adicionar</button>
      </form>
      <div className="catalogTools">
        <input
          list={datalistId}
          placeholder={`Pesquisar ${title.toLowerCase()}`}
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <datalist id={datalistId}>
          {values.map(value => <option key={value} value={value} />)}
        </datalist>
        <select
          value={order}
          onChange={event => {
            setOrder(event.target.value as typeof order);
            setPage(1);
          }}
        >
          <option value="name-asc">Nome A-Z</option>
          <option value="name-desc">Nome Z-A</option>
          <option value="created-desc">Criação recente</option>
          <option value="created-asc">Criação antiga</option>
          <option value="updated-desc">Alteração recente</option>
          <option value="updated-asc">Alteração antiga</option>
        </select>
      </div>
      <div className="paginationBar catalogPaginationBar">
        <div className="paginationSummary">
          <strong>{visibleValues.length}</strong> registro(s)
          <span>Mostrando {visibleValues.length ? startIndex + 1 : 0}-{Math.min(endIndex, visibleValues.length)}</span>
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
      <div className="catalogDateFilters">
        <label><span>Criação de</span><input type="date" value={createdFrom} onChange={event => { setCreatedFrom(event.target.value); setPage(1); }} /></label>
        <label><span>Criação até</span><input type="date" value={createdTo} onChange={event => { setCreatedTo(event.target.value); setPage(1); }} /></label>
        <label><span>Alteração de</span><input type="date" value={updatedFrom} onChange={event => { setUpdatedFrom(event.target.value); setPage(1); }} /></label>
        <label><span>Alteração até</span><input type="date" value={updatedTo} onChange={event => { setUpdatedTo(event.target.value); setPage(1); }} /></label>
      </div>
      {values.length > 0 && (
        <div className="catalogBulk">
          <label>
            <input
              type="checkbox"
              checked={paginatedValues.length > 0 && paginatedValues.every(value => selectedSet.has(value))}
              onChange={event => toggleAll(event.target.checked)}
            />
            Selecionar página
          </label>
          <button type="button" className="btn dangerSoft small" disabled={!selected.length} onClick={() => setConfirming(true)}>
            Remover selecionados
          </button>
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Excluir cadastro(s)?"
          text={`${selected.length} cadastro(s) serão removido(s). Registros que usam esses valores ficarão em branco.`}
          safeLabel="Cancelar"
          confirmLabel="Confirmar exclusão"
          confirmClassName="btn dangerStrong calendarDeleteButton"
          onSafe={() => setConfirming(false)}
          onConfirm={confirmRemove}
        />
      )}
      <div className="catalogList">
        {!values.length && <div className="empty smallEmpty">Nada cadastrado ainda.</div>}
        {values.length > 0 && !visibleValues.length && <div className="empty smallEmpty">Nenhum cadastro encontrado.</div>}
        {paginatedValues.map(value => (
          <div className="catalogItem" key={value}>
            {editing === value ? (
              <form className="catalogEdit" onSubmit={saveEdit}>
                <input autoFocus value={draft} onChange={event => setDraft(event.target.value)} />
                <button className="btn primary small">Salvar</button>
                <button type="button" className="btn ghost small" onClick={() => setEditing('')}>Cancelar</button>
              </form>
            ) : (
              <>
                <label className="catalogSelect">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(value)}
                    onChange={event => toggleSelected(value, event.target.checked)}
                  />
                  <strong>{value}</strong>
                </label>
                <small className="catalogDates">
                  Criado: {fmtDate(isoDate(dates[value]?.createdAt || ''))} | Alterado: {fmtDate(isoDate(dates[value]?.updatedAt || ''))}
                </small>
                <div className="actions">
                  <button onClick={() => startEdit(value)}>Editar</button>
                  <button className="danger" onClick={() => {
                    setSelected([value]);
                    setConfirming(true);
                  }}>Remover</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {visibleValues.length > 0 && (
        <div className="paginationFooter catalogPaginationFooter">
          <button type="button" className="btn ghost small" disabled={currentPage === 1} onClick={() => setPage(1)}>Primeira</button>
          <button type="button" className="btn ghost small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>Página {currentPage} de {totalPages}</span>
          <button type="button" className="btn ghost small" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Próxima</button>
          <button type="button" className="btn ghost small" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Última</button>
        </div>
      )}
    </div>
  );
}
