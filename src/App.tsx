import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, loadState, saveState, sendCalendarToN8n, signIn, type AuthSession } from './api';
import { addDaysISO, baseValidation, dispatchValidation, fmtDate, isBaseStale, overlapMap, todayISO, uid } from './logic';
import { AUTH_STORAGE_KEY, CHIP_OPTIONS, DISPATCH_FORM_STATUS, EXCEL_TYPES, MAX_ATTACHMENT_SIZE, RESPONSIBLE_BY_EMAIL } from './config/dispatch';
import { emptyBase, emptyDispatch, defaultFilters } from './utils/factories';
import type { AppState, BaseRule, BaseSort, CatalogKey, Dispatch, DispatchChannel, DispatchChip, DispatchSortField, DispatchStatus, FileAttachment, FilterKey, Modal, SortDirection, Tab } from './types';
import { STATUS } from './types';

export default function App() {
  const [state, setState] = useState<AppState>({ dispatches: [], bases: [], campaigns: [], audiences: [], responsibles: [] });
  const stateRef = useRef(state);
  const saveQueueRef = useRef(Promise.resolve());
  const saveVersionRef = useRef(0);
  const activeSavesRef = useRef(0);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('email');
  const [modal, setModal] = useState<Modal>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState<Dispatch>(emptyDispatch());
  const [viewingDispatch, setViewingDispatch] = useState<Dispatch | null>(null);
  const [viewingDispatchFromCalendar, setViewingDispatchFromCalendar] = useState(false);
  const [viewingDay, setViewingDay] = useState('');
  const [editingBase, setEditingBase] = useState<BaseRule>(emptyBase());
  const [dispatchSortField, setDispatchSortField] = useState<DispatchSortField>('dispatchDate');
  const [dispatchSortDirection, setDispatchSortDirection] = useState<SortDirection>('asc');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarDeleteTarget, setCalendarDeleteTarget] = useState<Dispatch | null>(null);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [calendarMonth, setCalendarMonth] = useState(todayISO().slice(0, 7));
  const [baseQuery, setBaseQuery] = useState('');
  const [baseSort, setBaseSort] = useState<BaseSort>('name');

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!savedMessage) return;
    const timeout = window.setTimeout(() => setSavedMessage(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [savedMessage]);

  useEffect(() => {
    if (!modal && !calendarDeleteTarget) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (calendarDeleteTarget) {
        if (!calendarSyncing) setCalendarDeleteTarget(null);
        return;
      }
      closeModal();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [modal, calendarDeleteTarget, calendarSyncing]);

  useEffect(() => {
    if (!headerMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (!target?.closest('.headerMenu')) setHeaderMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setHeaderMenuOpen(false);
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [headerMenuOpen]);

  async function restoreSession() {
    const accessToken = window.localStorage.getItem(AUTH_STORAGE_KEY) || window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!accessToken) {
      setAuthChecking(false);
      return;
    }

    try {
      const current = await getCurrentUser(accessToken);
      setSession(current);
      await refreshState(accessToken);
    } catch {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
      setSession(null);
    } finally {
      setAuthChecking(false);
    }
  }

  async function login(email: string, password: string, keepConnected: boolean) {
    setAuthError('');
    setError('');
    try {
      const current = await signIn(email, password);
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
      const storage = keepConnected ? window.localStorage : window.sessionStorage;
      storage.setItem(AUTH_STORAGE_KEY, current.accessToken);
      setSession(current);
      await refreshState(current.accessToken);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    }
  }

  function logout() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setSession(null);
    setAppState({ dispatches: [], bases: [], campaigns: [], audiences: [], responsibles: [] });
    setSavedMessage('');
    setError('');
  }

  async function refreshState(accessToken = session?.accessToken || '') {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await loadState(accessToken);
      setAppState(normalizeState(data));
      setSavedMessage('Dados recarregados do Supabase.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  }

  async function sendDispatchToCalendar(dispatch: Dispatch) {
    if (!session?.accessToken) {
      setError('Faça login para enviar os disparos ao calendário.');
      return;
    }

    setCalendarSyncing(true);
    setError('');
    setSavedMessage('');
    try {
      const result = await sendCalendarToN8n(dispatch.id, session.accessToken, 'upsert');
      const current = stateRef.current;
      setAppState({
        ...current,
        revision: result.revision,
        dispatches: current.dispatches.map(item => item.id === dispatch.id
          ? { ...item, googleCalendarEventId: result.eventId }
          : item)
      });
      setViewingDispatch(item => item?.id === dispatch.id
        ? { ...item, googleCalendarEventId: result.eventId }
        : item);
      setSavedMessage('Disparo sincronizado com o Google Calendar.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar ao n8n.');
    } finally {
      setCalendarSyncing(false);
    }
  }

  async function removeDispatchFromCalendar(dispatch: Dispatch) {
    if (!session?.accessToken) {
      setError('Faça login para remover o disparo do calendário.');
      return;
    }
    setCalendarSyncing(true);
    setError('');
    setSavedMessage('');
    try {
      const result = await sendCalendarToN8n(dispatch.id, session.accessToken, 'delete');
      const current = stateRef.current;
      setAppState({
        ...current,
        revision: result.revision,
        dispatches: current.dispatches.map(item => item.id === dispatch.id
          ? { ...item, googleCalendarEventId: '' }
          : item)
      });
      setViewingDispatch(item => item?.id === dispatch.id
        ? { ...item, googleCalendarEventId: '' }
        : item);
      setCalendarDeleteTarget(null);
      setSavedMessage('Disparo removido do Google Calendar pelo n8n.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar ao n8n.');
    } finally {
      setCalendarSyncing(false);
    }
  }

  async function persist(next: AppState, deletedCatalog?: { key: CatalogKey; value: string } | { key: CatalogKey; value: string }[]) {
    if (!session?.accessToken) {
      setError('Faça login para salvar alterações.');
      return;
    }
    const accessToken = session.accessToken;
    const saveVersion = saveVersionRef.current + 1;
    saveVersionRef.current = saveVersion;
    setError('');
    setSavedMessage('');
    const previous = stateRef.current;
    setAppState({ ...next, revision: previous.revision });

    const runSave = async () => {
      activeSavesRef.current += 1;
      setSaving(true);
      try {
        const saved = await saveState({ ...next, revision: stateRef.current.revision }, accessToken, deletedCatalog);
        const normalized = normalizeState(saved);
        if (saveVersion === saveVersionRef.current) {
          setAppState(normalized);
          setSavedMessage('Salvo no Supabase.');
        } else {
          setAppState({ ...stateRef.current, revision: normalized.revision, catalogDates: normalized.catalogDates, database: normalized.database });
        }
      } catch (err) {
        if (saveVersion === saveVersionRef.current) setAppState(previous);
        setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
      } finally {
        activeSavesRef.current -= 1;
        if (activeSavesRef.current === 0) setSaving(false);
      }
    };

    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    await saveQueueRef.current;
  }

  function setAppState(next: AppState) {
    stateRef.current = next;
    setState(next);
  }

  const activeChannel: DispatchChannel = tab === 'whatsapp' ? 'whatsapp' : tab === 'html_email' ? 'html_email' : 'email';
  const channelLabel = channelName(activeChannel);
  const channelDispatches = useMemo(
    () => state.dispatches.filter(dispatch => (dispatch.channel || 'email') === activeChannel),
    [activeChannel, state.dispatches]
  );
  const baseById = useMemo(() => new Map(state.bases.map(base => [base.id, base])), [state.bases]);
  const overlaps = useMemo(() => overlapMap(channelDispatches), [channelDispatches]);
  const duplicateNames = useMemo(() => duplicateDispatchNameMap(channelDispatches), [channelDispatches]);

  const filteredDispatches = useMemo(() => {
    const list = channelDispatches.filter(dispatch => {
      const text = `${dispatch.id} ${dispatch.baseId} ${dispatch.campaign} ${dispatch.audience} ${dispatch.description} ${dispatch.templateName} ${dispatch.subject} ${dispatch.body}`.toLowerCase();
      const base = baseById.get(dispatch.baseId);
      const validation = dispatchValidation(dispatch, state.bases);
      if (filters.q && !text.includes(filters.q.toLowerCase())) return false;
      if (filters.start && dispatch.date < filters.start) return false;
      if (filters.end && dispatch.date > filters.end) return false;
      if (filters.campaign && dispatch.campaign !== filters.campaign) return false;
      if (filters.audience && dispatch.audience !== filters.audience) return false;
      if (filters.status && dispatch.status !== filters.status) return false;
      if (filters.base && dispatch.baseId !== filters.base) return false;
      if (filters.responsible && dispatch.responsible !== filters.responsible) return false;
      if (filters.validation && validation.level !== filters.validation) return false;
      if (filters.pending && ['Enviado', 'Cancelado'].includes(dispatch.status)) return false;
      if (filters.sent && dispatch.status !== 'Enviado') return false;
      if (filters.alert && validation.level === 'green') return false;
      if (filters.overlap && !overlaps.has(dispatch.id)) return false;
      if (filters.missingBase && base) return false;
      if (filters.staleBase && !isBaseStale(dispatch, base)) return false;
      if (filters.readyOnly && !['Pronto para disparo', 'Enviado'].includes(dispatch.status)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const comparison = dispatchSortValue(a, dispatchSortField).localeCompare(dispatchSortValue(b, dispatchSortField));
      return dispatchSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [baseById, channelDispatches, dispatchSortDirection, dispatchSortField, filters, overlaps, state.bases]);

  const metrics = useMemo(() => ({
    total: filteredDispatches.length,
    planned: filteredDispatches.filter(item => item.status === 'Planejado').length,
    sent: filteredDispatches.filter(item => item.status === 'Enviado').length,
    pending: filteredDispatches.filter(item => !['Enviado', 'Cancelado'].includes(item.status)).length,
    overlap: filteredDispatches.filter(item => overlaps.has(item.id)).length,
    missingBase: filteredDispatches.filter(item => !baseById.get(item.baseId)).length,
    ready: filteredDispatches.filter(item => item.status === 'Pronto para disparo').length
  }), [baseById, filteredDispatches, overlaps]);

  const upcomingDispatches = useMemo(() => {
    const start = todayISO();
    const end = addDaysISO(start, 15);
    return channelDispatches
      .filter(item => item.date >= start && item.date <= end && item.status !== 'Cancelado')
      .sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`))
      .slice(0, 8);
  }, [channelDispatches]);

  const incompleteItems = useMemo(() => {
    const dispatches = channelDispatches
      .filter(item => !item.responsible)
      .map(item => `${fmtDate(item.date)} - disparo sem ${missingDispatchFields(item).join(', ')}`);
    const bases = state.bases
      .filter(item => !item.responsible || !item.mainBase || !item.expectedAction)
      .map(item => `${item.mainBase || 'Regra de base'} - regra sem ${missingBaseFields(item).join(', ')}`);
    const duplicateWarnings = [...duplicateNames.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([name, items]) => `Nome duplicado: ${name} (${items.length} disparos)`);
    return [...duplicateWarnings, ...dispatches, ...bases].slice(0, 8);
  }, [channelDispatches, duplicateNames, state.bases]);

  const campaigns = unique([...state.campaigns, ...state.dispatches.map(item => item.campaign), ...state.bases.map(item => item.campaign)]);
  const audiences = unique([...state.audiences, ...state.dispatches.map(item => item.audience)]);
  const responsibles = unique([...state.responsibles, ...state.dispatches.map(item => item.responsible), ...state.bases.map(item => item.responsible)]);
  const sessionResponsible = session ? responsibleForEmail(session.email) : '';
  const baseSuggestions = useMemo(() => unique(state.bases.flatMap(base => [base.campaign, base.mainBase, base.responsible])), [state.bases]);
  const filteredBases = useMemo(() => {
    const query = baseQuery.trim().toLowerCase();
    const list = state.bases.filter(base => {
      if (!query) return true;
      return `${base.campaign} ${base.mainBase} ${base.expectedAction} ${base.responsible}`.toLowerCase().includes(query);
    });
    return list.sort((a, b) => {
      if (baseSort === 'date-desc') return (b.lastUpdated || '').localeCompare(a.lastUpdated || '');
      if (baseSort === 'date-asc') return (a.lastUpdated || '').localeCompare(b.lastUpdated || '');
      return `${a.mainBase} ${a.campaign}`.localeCompare(`${b.mainBase} ${b.campaign}`, 'pt-BR');
    });
  }, [baseQuery, baseSort, state.bases]);
  const calendarDispatches = useMemo(
    () => state.dispatches
      .filter(item => item.date.startsWith(calendarMonth))
      .sort((a, b) => `${a.date} ${a.time || '00:00'}`.localeCompare(`${b.date} ${b.time || '00:00'}`)),
    [calendarMonth, state.dispatches]
  );
  const viewingDayDispatches = useMemo(
    () => state.dispatches
      .filter(item => item.date === viewingDay)
      .sort((a, b) => `${a.time || '00:00'} ${a.campaign}`.localeCompare(`${b.time || '00:00'} ${b.campaign}`)),
    [state.dispatches, viewingDay]
  );
  const detailChannelDispatches = useMemo(
    () => viewingDispatch
      ? state.dispatches.filter(dispatch => (dispatch.channel || 'email') === (viewingDispatch.channel || 'email'))
      : [],
    [state.dispatches, viewingDispatch]
  );
  const detailOverlaps = useMemo(() => overlapMap(detailChannelDispatches), [detailChannelDispatches]);
  const detailDuplicateNames = useMemo(() => duplicateDispatchNameMap(detailChannelDispatches), [detailChannelDispatches]);

  function updateFilter(key: FilterKey, value: string | boolean) {
    setFilters(current => ({ ...current, [key]: value }));
  }

  function setPeriod(days: number) {
    const start = todayISO();
    setFilters(current => ({ ...current, start, end: addDaysISO(start, days) }));
  }

  function openDispatch(dispatch?: Dispatch) {
    const latest = dispatch
      ? stateRef.current.dispatches.find(item => item.id === dispatch.id) || dispatch
      : null;
    setEditingDispatch(latest ? { ...latest } : { ...emptyDispatch(activeChannel), responsible: sessionResponsible });
    setModal('dispatch');
  }

  function openDispatchDetails(dispatch: Dispatch, fromCalendar = false) {
    setViewingDispatch({ ...dispatch });
    setViewingDispatchFromCalendar(fromCalendar);
    setModal('dispatchDetails');
  }

  function openCalendarDay(day: string) {
    setViewingDay(day);
    setModal('calendarDay');
  }

  function goToDispatchCalendar(dispatch: Dispatch) {
    setTab('calendar');
    setCalendarMonth(dispatch.date.slice(0, 7));
    setViewingDispatch(null);
    setViewingDispatchFromCalendar(false);
    setViewingDay(dispatch.date);
    setModal('calendarDay');
  }

  function openBase(base?: BaseRule) {
    setEditingBase(base ? { ...base } : { ...emptyBase(), responsible: sessionResponsible });
    setModal('base');
  }

  function closeModal() {
    setModal(null);
    setViewingDispatch(null);
    setViewingDispatchFromCalendar(false);
    setViewingDay('');
  }

  async function submitDispatch(event: FormEvent) {
    event.preventDefault();
    const responsible = sessionResponsible || editingDispatch.responsible.trim();
    const draft = { ...editingDispatch, responsible };
    const missing = missingDispatchFields(draft);
    if (missing.length) {
      setError(`Complete o disparo antes de salvar: ${missing.join(', ')}.`);
      return;
    }
    const now = new Date().toISOString();
    const item = {
      ...editingDispatch,
      channel: editingDispatch.channel || activeChannel,
      time: editingDispatch.time,
      templateName: editingDispatch.templateName.trim(),
      chip: editingDispatch.chip,
      htmlContent: editingDispatch.htmlContent.trim(),
      subject: editingDispatch.subject.trim(),
      body: editingDispatch.body.trim(),
      attachments: editingDispatch.attachments || [],
      campaign: editingDispatch.campaign.trim(),
      audience: editingDispatch.audience.trim(),
      responsible,
      description: editingDispatch.description.trim(),
      id: editingDispatch.id || uid('disparo'),
      createdAt: editingDispatch.createdAt || now,
      updatedAt: now
    };
    const next = editingDispatch.id
      ? state.dispatches.map(dispatch => dispatch.id === item.id ? item : dispatch)
      : [...state.dispatches, item];
    closeModal();
    await persist({
      ...state,
      dispatches: next,
      campaigns: unique([...state.campaigns, item.campaign]),
      audiences: unique([...state.audiences, item.audience]),
      responsibles: unique([...state.responsibles, item.responsible])
    });
  }

  async function submitBase(event: FormEvent) {
    event.preventDefault();
    const responsible = sessionResponsible || editingBase.responsible.trim();
    const draft = { ...editingBase, responsible };
    const missing = missingBaseFields(draft);
    if (missing.length) {
      setError(`Complete a regra de base antes de salvar: ${missing.join(', ')}.`);
      return;
    }
    const item = {
      ...editingBase,
      campaign: editingBase.campaign.trim(),
      mainBase: editingBase.mainBase.trim(),
      excludedBases: editingBase.excludedBases.trim(),
      expectedAction: editingBase.expectedAction.trim(),
      responsible,
      notes: editingBase.notes.trim(),
      id: editingBase.id || uid('base')
    };
    const next = editingBase.id
      ? state.bases.map(base => base.id === item.id ? item : base)
      : [...state.bases, item];
    closeModal();
    await persist({
      ...state,
      bases: next,
      campaigns: unique([...state.campaigns, item.campaign]),
      responsibles: unique([...state.responsibles, item.responsible])
    });
  }

  async function changeStatus(id: string, status: DispatchStatus) {
    const current = stateRef.current;
    const next = current.dispatches.map(dispatch =>
      dispatch.id === id ? { ...dispatch, status, updatedAt: new Date().toISOString() } : dispatch
    );
    await persist({ ...current, dispatches: next });
  }

  async function deleteDispatches(ids: string[]) {
    const selected = new Set(ids.filter(Boolean));
    if (!selected.size) return;
    await persist({ ...state, dispatches: state.dispatches.filter(item => !selected.has(item.id)) });
  }

  async function deleteBase(id: string) {
    if (!confirm('Excluir esta regra de base? Os disparos vinculados ficarão sem base.')) return;
    await persist({
      ...state,
      bases: state.bases.filter(item => item.id !== id),
      dispatches: state.dispatches.map(item => item.baseId === id ? { ...item, baseId: '' } : item)
    });
  }

  async function addCatalogItem(key: CatalogKey, value: string) {
    const clean = value.trim();
    if (!clean) return;
    if (state[key].some(item => item.toLowerCase() === clean.toLowerCase())) return;
    await persist({ ...state, [key]: unique([...state[key], clean]) });
  }

  async function updateCatalogItem(key: CatalogKey, oldValue: string, newValue: string) {
    const clean = newValue.trim();
    if (!clean || clean === oldValue) return;
    const nextCatalog = unique(state[key].map(item => item === oldValue ? clean : item));
    const nextState: AppState = { ...state, [key]: nextCatalog };
    if (key === 'campaigns') {
      nextState.dispatches = state.dispatches.map(item => item.campaign === oldValue ? { ...item, campaign: clean } : item);
      nextState.bases = state.bases.map(item => item.campaign === oldValue ? { ...item, campaign: clean } : item);
    }
    if (key === 'audiences') {
      nextState.dispatches = state.dispatches.map(item => item.audience === oldValue ? { ...item, audience: clean } : item);
    }
    if (key === 'responsibles') {
      nextState.dispatches = state.dispatches.map(item => item.responsible === oldValue ? { ...item, responsible: clean } : item);
      nextState.bases = state.bases.map(item => item.responsible === oldValue ? { ...item, responsible: clean } : item);
    }
    await persist(nextState, { key, value: oldValue });
  }

  async function removeCatalogItems(key: CatalogKey, values: string[]) {
    const selected = values.filter(Boolean);
    if (!selected.length) return;
    const selectedSet = new Set(selected);
    const nextState: AppState = { ...state, [key]: state[key].filter(item => !selectedSet.has(item)) };
    if (key === 'campaigns') {
      nextState.dispatches = state.dispatches.map(item => selectedSet.has(item.campaign) ? { ...item, campaign: '' } : item);
      nextState.bases = state.bases.map(item => selectedSet.has(item.campaign) ? { ...item, campaign: '' } : item);
    }
    if (key === 'audiences') {
      nextState.dispatches = state.dispatches.map(item => selectedSet.has(item.audience) ? { ...item, audience: '' } : item);
    }
    if (key === 'responsibles') {
      nextState.dispatches = state.dispatches.map(item => selectedSet.has(item.responsible) ? { ...item, responsible: '' } : item);
      nextState.bases = state.bases.map(item => selectedSet.has(item.responsible) ? { ...item, responsible: '' } : item);
    }
    await persist(nextState, selected.map(value => ({ key, value })));
  }

  if (authChecking) {
    return (
      <main className="authPage">
        <div className="authCard">
          <img className="authLogo" src="/unigran-logo.png" alt="UNIGRAN" />
          <strong>Carregando acesso...</strong>
        </div>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen error={authError} onLogin={login} />;
  }

  return (
    <main className="app">
      <header className="header">
        <div>
          <img className="brandLogo" src="/unigran-logo.png" alt="UNIGRAN" />
          <h1>Planejamento de Disparos</h1>
          <p>Controle de campanhas, públicos, bases de exclusão e validações antes do envio.</p>
          <span className="sessionBadge">{session.email}</span>
        </div>
        <div className="headerActions">
          <details className="headerMenu" open={headerMenuOpen}>
            <summary
              aria-label="Abrir ações rápidas"
              onClick={event => {
                event.preventDefault();
                setHeaderMenuOpen(current => !current);
              }}
            >
              •••
            </summary>
            <div className="headerMenuPanel">
              <button type="button" className="menuRefresh" onClick={() => {
                setHeaderMenuOpen(false);
                refreshState();
              }} disabled={loading || saving}>{loading ? 'Recarregando...' : 'Recarregar'}</button>
              <a className="menuFormatter" href="https://formatador-rd.vercel.app/" target="_blank" rel="noreferrer" onClick={() => setHeaderMenuOpen(false)}>Unigran Formater</a>
              <button type="button" className="menuLogout" onClick={() => {
                setHeaderMenuOpen(false);
                logout();
              }}>Sair</button>
            </div>
          </details>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {savedMessage && !error && <div className="success">{savedMessage}</div>}

      <nav className="tabs" aria-label="Navegação principal">
        <button aria-pressed={tab === 'email'} className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>Disparos de e-mail</button>
        <button aria-pressed={tab === 'whatsapp'} className={tab === 'whatsapp' ? 'active' : ''} onClick={() => setTab('whatsapp')}>Disparos de WhatsApp</button>
        <button aria-pressed={tab === 'html_email'} className={tab === 'html_email' ? 'active' : ''} onClick={() => setTab('html_email')}>E-mail HTML</button>
        <button aria-pressed={tab === 'calendar'} className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>Calendário</button>
        <button aria-pressed={tab === 'bases'} className={tab === 'bases' ? 'active' : ''} onClick={() => setTab('bases')}>Regras de bases</button>
        <button aria-pressed={tab === 'catalogs'} className={tab === 'catalogs' ? 'active' : ''} onClick={() => setTab('catalogs')}>Cadastros</button>
      </nav>

      {(tab === 'email' || tab === 'whatsapp' || tab === 'html_email') && (
        <>
          <section className="summary">
            <Metric label="Total de disparos" value={metrics.total} />
            <Metric label="Planejados" value={metrics.planned} />
            <Metric label="Enviados" value={metrics.sent} />
            <Metric label="Pendentes" value={metrics.pending} />
            <Metric label="Com sobreposição" value={metrics.overlap} tone="warning" />
            <Metric label="Sem base" value={metrics.missingBase} tone="risk" />
            <Metric label="Prontos" value={metrics.ready} />
          </section>

          <section className="dailyPanel">
            <div>
              <div className="panelHead compact">
                <div>
                  <h2>Próximos disparos</h2>
                  <p>Agenda dos próximos 15 dias de {channelLabel}</p>
                </div>
              </div>
              <UpcomingList dispatches={upcomingDispatches} bases={state.bases} />
            </div>
            <div>
              <div className="panelHead compact">
                <div>
                  <h2>Pendências de cadastro</h2>
                  <p>Campos incompletos que podem travar o fluxo</p>
                </div>
              </div>
              <IssueList items={incompleteItems} />
            </div>
          </section>

          <section className="panel">
            <div className="filterToolbar">
              <button className="btn primary newDispatchButton" onClick={() => openDispatch()}>Novo disparo</button>
              <button className="btn ghost small" onClick={() => setPeriod(7)}>Próximos 7 dias</button>
              <button className="btn ghost small" onClick={() => setPeriod(15)}>Próximos 15 dias</button>
              <button className="btn ghost small" onClick={() => setPeriod(30)}>Próximos 30 dias</button>
              <button className="btn ghost small" onClick={() => setFilters(defaultFilters())}>Limpar filtros</button>
            </div>
            <div className="filterBoard">
              <div className="filterGroup searchGroup">
                <span>Busca e período</span>
                <div className="filterRow dateRow">
                  <input placeholder="Buscar por ID, campanha, template ou assunto" value={filters.q} onChange={event => updateFilter('q', event.target.value)} />
                  <input type="date" value={filters.start} onChange={event => updateFilter('start', event.target.value)} />
                  <input type="date" value={filters.end} onChange={event => updateFilter('end', event.target.value)} />
                </div>
              </div>
              <div className="filterGroup">
                <span>Classificação</span>
                <div className="filterRow selectRow">
                  <Select value={filters.campaign} values={campaigns} placeholder="Campanha" onChange={value => updateFilter('campaign', value)} />
                  <Select value={filters.audience} values={audiences} placeholder="Público" onChange={value => updateFilter('audience', value)} />
                  <Select value={filters.status} values={STATUS} placeholder="Status" onChange={value => updateFilter('status', value)} />
                  <Select value={filters.base} values={state.bases.map(base => base.id)} labels={new Map(state.bases.map(base => [base.id, `${base.campaign} - ${base.mainBase}`]))} placeholder="Base" onChange={value => updateFilter('base', value)} />
                  <Select value={filters.responsible} values={responsibles} placeholder="Responsável" onChange={value => updateFilter('responsible', value)} />
                  <Select value={filters.validation} values={['green', 'yellow', 'red']} labels={new Map([['green', 'Base validada'], ['yellow', 'Conferir base'], ['red', 'Risco de envio']])} placeholder="Validação" onChange={value => updateFilter('validation', value)} />
                </div>
              </div>
              <div className="filterGroup wideGroup">
                <span>Situação</span>
                <div className="flags">
                  <label className={filters.pending ? 'active' : ''}><input type="checkbox" checked={filters.pending} onChange={event => updateFilter('pending', event.target.checked)} /> Pendentes</label>
                  <label className={filters.sent ? 'active' : ''}><input type="checkbox" checked={filters.sent} onChange={event => updateFilter('sent', event.target.checked)} /> Enviados</label>
                  <label className={filters.alert ? 'active' : ''}><input type="checkbox" checked={filters.alert} onChange={event => updateFilter('alert', event.target.checked)} /> Com alerta</label>
                  <label className={filters.overlap ? 'active' : ''}><input type="checkbox" checked={filters.overlap} onChange={event => updateFilter('overlap', event.target.checked)} /> Com sobreposição</label>
                  <label className={filters.missingBase ? 'active' : ''}><input type="checkbox" checked={filters.missingBase} onChange={event => updateFilter('missingBase', event.target.checked)} /> Sem base</label>
                  <label className={filters.staleBase ? 'active' : ''}><input type="checkbox" checked={filters.staleBase} onChange={event => updateFilter('staleBase', event.target.checked)} /> Base desatualizada</label>
                  <label className={filters.readyOnly ? 'active' : ''}><input type="checkbox" checked={filters.readyOnly} onChange={event => updateFilter('readyOnly', event.target.checked)} /> Pronto/enviado</label>
                  <div className="sortControls">
                    <select value={dispatchSortField} onChange={event => setDispatchSortField(event.target.value as DispatchSortField)}>
                      <option value="dispatchDate">Data do disparo</option>
                      <option value="createdAt">Data de criação</option>
                      <option value="updatedAt">Data de alteração</option>
                    </select>
                    <select value={dispatchSortDirection} onChange={event => setDispatchSortDirection(event.target.value as SortDirection)}>
                      <option value="asc">Crescente</option>
                      <option value="desc">Decrescente</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <DispatchTable
              dispatches={filteredDispatches}
              bases={state.bases}
              overlaps={overlaps}
              duplicateNames={duplicateNames}
              onView={openDispatchDetails}
              onEdit={openDispatch}
              onDelete={deleteDispatches}
              onStatus={changeStatus}
            />
          </section>
        </>
      )}

      {tab === 'calendar' && (
        <section className="panel calendarPanel">
          <div className="panelHead">
            <div>
              <h2>Calendário de disparos</h2>
              <p>E-mail, WhatsApp e HTML no mesmo mês</p>
            </div>
            <div className="calendarActions">
              <button className="btn ghost small" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, -1))}>Mês anterior</button>
              <strong>{monthLabel(calendarMonth)}</strong>
              <button className="btn ghost small" onClick={() => setCalendarMonth(todayISO().slice(0, 7))}>Hoje</button>
              <button className="btn ghost small" onClick={() => setCalendarMonth(shiftMonth(calendarMonth, 1))}>Próximo mês</button>
            </div>
          </div>
          <CalendarView
            month={calendarMonth}
            dispatches={calendarDispatches}
            onView={dispatch => openDispatchDetails(dispatch, true)}
            onDayView={openCalendarDay}
          />
        </section>
      )}

      {tab === 'bases' && (
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Regras de bases</h2>
              <p>{filteredBases.length} de {state.bases.length} regra(s)</p>
            </div>
            <button className="btn primary" onClick={() => openBase()}>Nova regra</button>
          </div>
          <div className="listControls">
            <input
              list="base-search-suggestions"
              placeholder="Pesquisar base, campanha ou responsável"
              value={baseQuery}
              onChange={event => setBaseQuery(event.target.value)}
            />
            <datalist id="base-search-suggestions">
              {baseSuggestions.map(item => <option key={item} value={item} />)}
            </datalist>
            <select value={baseSort} onChange={event => setBaseSort(event.target.value as BaseSort)}>
              <option value="name">Nome</option>
              <option value="date-desc">Data mais recente</option>
              <option value="date-asc">Data mais antiga</option>
            </select>
          </div>
          <BaseTable bases={filteredBases} onEdit={openBase} onDelete={deleteBase} />
        </section>
      )}

      {tab === 'catalogs' && (
        <section className="panel">
          <div className="panelHead">
            <div>
              <h2>Cadastros</h2>
              <p>Listas usadas nos selects de novo disparo e regras de bases</p>
            </div>
          </div>
          <div className="catalogGrid">
            <CatalogManager
              title="Campanhas"
              description="Usada em disparos e regras de bases"
              values={campaigns}
              dates={state.catalogDates?.campaigns || {}}
              onAdd={value => addCatalogItem('campaigns', value)}
              onUpdate={(oldValue, newValue) => updateCatalogItem('campaigns', oldValue, newValue)}
              onRemove={values => removeCatalogItems('campaigns', values)}
            />
            <CatalogManager
              title="Públicos"
              description="Usado no campo Público do disparo"
              values={audiences}
              dates={state.catalogDates?.audiences || {}}
              onAdd={value => addCatalogItem('audiences', value)}
              onUpdate={(oldValue, newValue) => updateCatalogItem('audiences', oldValue, newValue)}
              onRemove={values => removeCatalogItems('audiences', values)}
            />
          </div>
        </section>
      )}

      {modal === 'dispatch' && (
        <div className="modalBackdrop" onMouseDown={closeModal}>
          <form className="modal" onSubmit={submitDispatch} onMouseDown={event => event.stopPropagation()}>
            <ModalHead title={editingDispatch.id ? `Editar disparo de ${channelLabel}` : `Novo disparo de ${channelLabel}`} onClose={closeModal} />
            <div className="modalGrid">
              <Field label="Data de disparo">
                <BrazilianDatePicker
                  required
                  value={editingDispatch.date}
                  onChange={value => setEditingDispatch({ ...editingDispatch, date: value })}
                />
              </Field>
              <Field label="Hora do disparo">
                <TwentyFourHourPicker
                  value={editingDispatch.time}
                  onChange={value => setEditingDispatch({ ...editingDispatch, time: value })}
                />
              </Field>
              <Field label="Nome do template"><input value={editingDispatch.templateName} onChange={event => setEditingDispatch({ ...editingDispatch, templateName: event.target.value })} /></Field>
              <Field label="Integração"><Select value={editingDispatch.chip} values={CHIP_OPTIONS} placeholder="Selecione" onChange={value => setEditingDispatch({ ...editingDispatch, chip: value as DispatchChip })} /></Field>
              <Field label="Campanha">
                <SelectWithCreate
                  value={editingDispatch.campaign}
                  values={campaigns}
                  placeholder="Selecione"
                  createLabel="Adicionar campanha"
                  onChange={value => setEditingDispatch({ ...editingDispatch, campaign: value })}
                  onCreate={async value => {
                    await addCatalogItem('campaigns', value);
                    setEditingDispatch(current => ({ ...current, campaign: value.trim() }));
                  }}
                />
              </Field>
              <Field label="Público">
                <SelectWithCreate
                  value={editingDispatch.audience}
                  values={audiences}
                  placeholder="Selecione"
                  createLabel="Adicionar público"
                  createPlaceholder="Nome do público"
                  onChange={value => setEditingDispatch({ ...editingDispatch, audience: value })}
                  onCreate={async value => {
                    await addCatalogItem('audiences', value);
                    setEditingDispatch(current => ({ ...current, audience: value.trim() }));
                  }}
                />
              </Field>
              <Field label="Status"><Select value={editingDispatch.status} values={editingDispatch.id ? STATUS : DISPATCH_FORM_STATUS} showPlaceholder={false} onChange={value => setEditingDispatch({ ...editingDispatch, status: value as DispatchStatus })} /></Field>
              <Field label="Base"><Select value={editingDispatch.baseId} values={state.bases.map(base => base.id)} labels={new Map(state.bases.map(base => [base.id, `${base.campaign} - ${base.mainBase}`]))} placeholder="Selecione" onChange={value => setEditingDispatch({ ...editingDispatch, baseId: value })} /></Field>
              <Field label="Responsável">
                {sessionResponsible ? (
                  <input readOnly value={sessionResponsible} />
                ) : (
                  <SelectWithCreate
                    required
                    value={editingDispatch.responsible}
                    values={responsibles}
                    placeholder="Selecione"
                    createLabel="Adicionar responsável"
                    createPlaceholder="Nome do responsável"
                    onChange={value => setEditingDispatch({ ...editingDispatch, responsible: value })}
                    onCreate={async value => {
                      await addCatalogItem('responsibles', value);
                      setEditingDispatch(current => ({ ...current, responsible: value.trim() }));
                    }}
                  />
                )}
              </Field>
              <Field label="Assunto" wide><input value={editingDispatch.subject} onChange={event => setEditingDispatch({ ...editingDispatch, subject: event.target.value })} /></Field>
              {editingDispatch.channel !== 'html_email' && (
                <Field label="Conteúdo do e-mail (corpo)" wide asGroup>
                  <RichTextEditor
                    value={editingDispatch.body}
                    onChange={value => setEditingDispatch({ ...editingDispatch, body: value })}
                  />
                </Field>
              )}
              <Field label="Descrição" wide><textarea rows={3} value={editingDispatch.description} onChange={event => setEditingDispatch({ ...editingDispatch, description: event.target.value })} /></Field>
              <Field label="Anexos de imagem" wide asGroup>
                <AttachmentPicker
                  attachments={editingDispatch.attachments}
                  onAdd={attachments => setEditingDispatch(current => ({ ...current, attachments: [...current.attachments, ...attachments] }))}
                  onRemove={id => setEditingDispatch(current => ({ ...current, attachments: current.attachments.filter(item => item.id !== id) }))}
                />
              </Field>
              {editingDispatch.channel === 'html_email' && (
                <Field label="HTML do disparo" wide>
                  <textarea
                    className="htmlEditor"
                    rows={10}
                    value={editingDispatch.htmlContent}
                    placeholder="<html>...</html>"
                    onChange={event => setEditingDispatch({ ...editingDispatch, htmlContent: event.target.value })}
                  />
                </Field>
              )}
            </div>
            <ModalFoot saving={saving} onClose={closeModal} />
          </form>
        </div>
      )}

      {modal === 'dispatchDetails' && viewingDispatch && (
        <div className="modalBackdrop" onMouseDown={closeModal}>
          <div className="modal detailsModal" onMouseDown={event => event.stopPropagation()}>
            <ModalHead title={`Detalhes do disparo de ${channelName(viewingDispatch.channel || 'email')}`} onClose={closeModal} />
            <DispatchDetails
              dispatch={viewingDispatch}
              base={baseById.get(viewingDispatch.baseId)}
              validation={dispatchValidation(viewingDispatch, state.bases)}
              conflicts={detailOverlaps.get(viewingDispatch.id) || []}
              duplicateCount={duplicateNameCount(viewingDispatch, detailDuplicateNames)}
            />
            <div className="modalFoot">
              <button type="button" className="btn ghost" onClick={closeModal}>Fechar</button>
              <button type="button" className="btn ghost" onClick={() => goToDispatchCalendar(viewingDispatch)}>Ver no calendário</button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => sendDispatchToCalendar(viewingDispatch)}
                disabled={calendarSyncing || viewingDispatch.status !== 'Pronto para disparo'}
              >
                {calendarSyncing ? 'Sincronizando...' : 'Sincronizar Google Calendar'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCalendarDeleteTarget(viewingDispatch)}
                disabled={calendarSyncing}
              >
                Remover do Google Calendar
              </button>
              <button type="button" className="btn primary" onClick={() => openDispatch(viewingDispatch)}>Editar disparo</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'calendarDay' && viewingDay && (
        <div className="modalBackdrop" onMouseDown={closeModal}>
          <div className="modal calendarDayModal" onMouseDown={event => event.stopPropagation()}>
            <ModalHead title={`Disparos de ${fmtDate(viewingDay)}`} onClose={closeModal} />
            <CalendarDayDetails
              dispatches={viewingDayDispatches}
              onView={dispatch => openDispatchDetails(dispatch, true)}
              onEdit={dispatch => openDispatch(dispatch)}
            />
            <div className="modalFoot">
              <button type="button" className="btn primary" onClick={closeModal}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'base' && (
        <div className="modalBackdrop" onMouseDown={closeModal}>
          <form className="modal" onSubmit={submitBase} onMouseDown={event => event.stopPropagation()}>
            <ModalHead title={editingBase.id ? 'Editar regra de base' : 'Nova regra de base'} onClose={closeModal} />
            <div className="modalGrid">
              <Field label="Campanha">
                <SelectWithCreate
                  value={editingBase.campaign}
                  values={campaigns}
                  placeholder="Selecione"
                  createLabel="Adicionar campanha"
                  onChange={value => setEditingBase({ ...editingBase, campaign: value })}
                  onCreate={async value => {
                    await addCatalogItem('campaigns', value);
                    setEditingBase(current => ({ ...current, campaign: value.trim() }));
                  }}
                />
              </Field>
              <Field label="Responsável">
                {sessionResponsible ? (
                  <input readOnly value={sessionResponsible} />
                ) : (
                  <SelectWithCreate
                    required
                    value={editingBase.responsible}
                    values={responsibles}
                    placeholder="Selecione"
                    createLabel="Adicionar responsável"
                    createPlaceholder="Nome do responsável"
                    onChange={value => setEditingBase({ ...editingBase, responsible: value })}
                    onCreate={async value => {
                      await addCatalogItem('responsibles', value);
                      setEditingBase(current => ({ ...current, responsible: value.trim() }));
                    }}
                  />
                )}
              </Field>
              <Field label="Base principal" wide><input required value={editingBase.mainBase} onChange={event => setEditingBase({ ...editingBase, mainBase: event.target.value })} /></Field>
              <Field label="Bases excluídas" wide><textarea rows={2} value={editingBase.excludedBases} onChange={event => setEditingBase({ ...editingBase, excludedBases: event.target.value })} /></Field>
              <Field label="Ação esperada" wide><input required value={editingBase.expectedAction} onChange={event => setEditingBase({ ...editingBase, expectedAction: event.target.value })} /></Field>
              <Field label="Última atualização"><input type="date" value={editingBase.lastUpdated} onChange={event => setEditingBase({ ...editingBase, lastUpdated: event.target.value })} /></Field>
              <Field label="Base de disparo" wide asGroup>
                <SpreadsheetAttachmentPicker
                  attachment={editingBase.spreadsheetAttachment}
                  onChange={attachment => setEditingBase({ ...editingBase, spreadsheetAttachment: attachment })}
                  onRemove={() => setEditingBase({ ...editingBase, spreadsheetAttachment: null })}
                />
              </Field>
              <Field label="Notas" wide><textarea rows={2} value={editingBase.notes} onChange={event => setEditingBase({ ...editingBase, notes: event.target.value })} /></Field>
            </div>
            <ModalFoot saving={saving} onClose={closeModal} />
          </form>
        </div>
      )}

      {calendarDeleteTarget && (
        <div
          className="modalBackdrop calendarDeleteBackdrop"
          onMouseDown={() => {
            if (!calendarSyncing) setCalendarDeleteTarget(null);
          }}
        >
          <div
            className="calendarDeleteModal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="calendar-delete-title"
            aria-describedby="calendar-delete-description"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="calendarDeleteIcon" aria-hidden="true">!</div>
            <div className="calendarDeleteContent">
              <span className="calendarDeleteEyebrow">Google Calendar</span>
              <h2 id="calendar-delete-title">Remover este evento?</h2>
              <p id="calendar-delete-description">
                <strong>{dispatchDisplayName(calendarDeleteTarget) || 'Disparo sem nome'}</strong> será removido do Google Calendar.
                O disparo continuará salvo no aplicativo.
              </p>
              <div className="calendarDeleteMeta">
                <span>{fmtDate(calendarDeleteTarget.date)}{calendarDeleteTarget.time ? ` às ${calendarDeleteTarget.time}` : ''}</span>
                <span>{channelName(calendarDeleteTarget.channel || 'email')}</span>
              </div>
            </div>
            <div className="calendarDeleteActions">
              <button
                type="button"
                className="btn ghost"
                disabled={calendarSyncing}
                onClick={() => setCalendarDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn dangerStrong calendarDeleteButton"
                disabled={calendarSyncing}
                onClick={() => removeDispatchFromCalendar(calendarDeleteTarget)}
              >
                {calendarSyncing ? 'Removendo...' : 'Sim, remover evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function responsibleForEmail(email: string) {
  return RESPONSIBLE_BY_EMAIL[email.trim().toLowerCase()] || '';
}

function normalizeChip(value: string): DispatchChip {
  return CHIP_OPTIONS.includes(value as DispatchChip) ? value as DispatchChip : '';
}

function normalizeState(data: AppState): AppState {
  const dispatches = (data.dispatches || []).map(item => ({
    ...item,
    channel: item.channel || 'email',
    time: item.time || '',
    templateName: item.templateName || '',
    chip: normalizeChip(item.chip || ''),
    htmlContent: item.htmlContent || '',
    subject: item.subject || '',
    body: item.body || '',
    attachments: Array.isArray(item.attachments) ? item.attachments : []
  }));
  const bases = (data.bases || []).map(base => ({
    ...base,
    spreadsheetAttachment: base.spreadsheetAttachment || null
  }));
  return {
    dispatches,
    bases,
    campaigns: unique([...(data.campaigns || []), ...dispatches.map(item => item.campaign), ...bases.map(item => item.campaign)]),
    audiences: unique([...(data.audiences || []), ...dispatches.map(item => item.audience)]),
    responsibles: unique([...(data.responsibles || []), ...dispatches.map(item => item.responsible), ...bases.map(item => item.responsible)]),
    revision: data.revision,
    catalogDates: data.catalogDates || {},
    database: data.database
  };
}

function missingDispatchFields(dispatch: Dispatch) {
  return [
    !dispatch.responsible.trim() ? 'responsável' : ''
  ].filter(Boolean);
}

function isRichHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function plainTextToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function richTextHtml(value: string) {
  if (!value.trim()) return '';
  return sanitizeRichHtml(isRichHtml(value) ? value : plainTextToHtml(value));
}

function sanitizeRichHtml(value: string) {
  const doc = new DOMParser().parseFromString(value, 'text/html');
  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4',
    'I', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG', 'TABLE', 'TBODY', 'TD',
    'TH', 'THEAD', 'TR', 'U', 'UL'
  ]);
  const allowedStyles = new Set([
    'background-color', 'color', 'font-size', 'font-style', 'font-weight',
    'text-align', 'text-decoration'
  ]);

  doc.body.querySelectorAll('*').forEach(element => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    Array.from(element.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (name === 'href' && element.tagName === 'A') {
        const href = attribute.value.trim();
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          element.setAttribute('target', '_blank');
          element.setAttribute('rel', 'noreferrer');
          return;
        }
      }

      if (name === 'style') {
        const cleanStyle = attribute.value
          .split(';')
          .map(rule => rule.trim())
          .filter(rule => {
            const [property, rawValue = ''] = rule.split(':');
            const cleanProperty = property?.trim().toLowerCase();
            const cleanValue = rawValue.trim().toLowerCase();
            return allowedStyles.has(cleanProperty) && !/url|expression|javascript/.test(cleanValue);
          })
          .join('; ');
        if (cleanStyle) element.setAttribute('style', cleanStyle);
        else element.removeAttribute('style');
        return;
      }

      element.removeAttribute(attribute.name);
    });
  });

  return doc.body.innerHTML;
}

function insertHtmlAtSelection(html: string) {
  if (document.queryCommandSupported?.('insertHTML')) {
    document.execCommand('insertHTML', false, html);
    return;
  }

  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = html;
  range.insertNode(template.content);
  selection.collapseToEnd();
}

function isoDate(value: string) {
  return value ? value.slice(0, 10) : '';
}

function dispatchTime(value: string) {
  return value || '-';
}

function dispatchSortValue(dispatch: Dispatch, field: DispatchSortField) {
  if (field === 'createdAt') return dispatch.createdAt || '';
  if (field === 'updatedAt') return dispatch.updatedAt || '';
  return `${dispatch.date} ${dispatch.time || '00:00'}`;
}

function fileToAttachment(file: File): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      id: uid('anexo'),
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: String(reader.result || '')
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isExcelFile(file: File) {
  return EXCEL_TYPES.includes(file.type) || /\.(xls|xlsx)$/i.test(file.name);
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function dispatchDisplayName(dispatch: Dispatch) {
  return (dispatch.templateName || dispatch.campaign || '').trim();
}

function duplicateDispatchNameMap(dispatches: Dispatch[]) {
  const groups = new Map<string, Dispatch[]>();
  for (const dispatch of dispatches) {
    const name = dispatchDisplayName(dispatch);
    if (!name) continue;
    const key = name.toLocaleLowerCase('pt-BR');
    groups.set(key, [...(groups.get(key) || []), dispatch]);
  }
  const duplicates = new Map<string, Dispatch[]>();
  for (const items of groups.values()) {
    if (items.length > 1) duplicates.set(dispatchDisplayName(items[0]), items);
  }
  return duplicates;
}

function duplicateNameCount(dispatch: Dispatch, duplicates: Map<string, Dispatch[]>) {
  const name = dispatchDisplayName(dispatch);
  if (!name) return 0;
  const entry = [...duplicates.entries()].find(([label]) => label.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
  return entry ? entry[1].filter(item => item.id !== dispatch.id).length : 0;
}

function channelName(channel: DispatchChannel) {
  if (channel === 'html_email') return 'E-mail HTML';
  return channel === 'whatsapp' ? 'WhatsApp' : 'E-mail';
}

function monthLabel(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, monthIndex - 1, 1));
}

function shiftMonth(month: string, amount: number) {
  const [year, monthIndex] = month.split('-').map(Number);
  const value = new Date(year, monthIndex - 1 + amount, 1);
  return value.toISOString().slice(0, 7);
}

function calendarDays(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const first = new Date(year, monthIndex - 1, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setDate(start.getDate() + index);
    return value.toISOString().slice(0, 10);
  });
}

function missingBaseFields(base: BaseRule) {
  return [
    !base.responsible.trim() ? 'responsável' : '',
    !base.mainBase.trim() ? 'base principal' : '',
    !base.expectedAction.trim() ? 'ação esperada' : ''
  ].filter(Boolean);
}

function Metric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function brazilianDateText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function maskBrazilianDate(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseBrazilianDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  const candidate = `${year}-${month}-${day}`;
  const parsed = new Date(`${candidate}T12:00:00`);
  return parsed.getFullYear() === Number(year) &&
    parsed.getMonth() + 1 === Number(month) &&
    parsed.getDate() === Number(day)
    ? candidate
    : '';
}

function BrazilianDatePicker({ value, required = false, onChange }: {
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(brazilianDateText(value));

  useEffect(() => {
    if (document.activeElement !== textRef.current) setDraft(brazilianDateText(value));
  }, [value]);

  function updateText(rawValue: string) {
    const masked = maskBrazilianDate(rawValue);
    const parsed = parseBrazilianDate(masked);
    setDraft(masked);
    onChange(parsed);
    textRef.current?.setCustomValidity(
      masked.length === 10 && !parsed ? 'Informe uma data válida no formato dd/mm/aaaa.' : ''
    );
  }

  function validateText() {
    const parsed = parseBrazilianDate(draft);
    textRef.current?.setCustomValidity(
      parsed || (!required && !draft) ? '' : 'Informe uma data válida no formato dd/mm/aaaa.'
    );
  }

  function openCalendar() {
    const picker = nativeRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.click();
    }
  }

  return (
    <div className="localizedDatePicker">
      <input
        ref={textRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required={required}
        pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}"
        placeholder="dd/mm/aaaa"
        aria-label="Data no formato dia, mês e ano"
        value={draft}
        onChange={event => updateText(event.target.value)}
        onBlur={validateText}
      />
      <button type="button" className="datePickerButton" onClick={openCalendar} aria-label="Abrir calendário">
        <span aria-hidden="true">▦</span>
      </button>
      <input
        ref={nativeRef}
        className="nativeDatePicker"
        type="date"
        lang="pt-BR"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={event => {
          const next = event.target.value;
          setDraft(brazilianDateText(next));
          onChange(next);
          textRef.current?.setCustomValidity('');
        }}
      />
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

function TwentyFourHourPicker({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const match = value.match(/^(\d{2}):(\d{2})/);
  const hour = match?.[1] || '';
  const minute = match?.[2] || '';

  function update(hourValue: string, minuteValue: string) {
    if (!hourValue && !minuteValue) {
      onChange('');
      return;
    }
    onChange(`${hourValue || '00'}:${minuteValue || '00'}`);
  }

  return (
    <div className="twentyFourHourPicker" aria-label="Horário em formato de 24 horas">
      <select aria-label="Hora" value={hour} onChange={event => update(event.target.value, minute)}>
        <option value="">Hora</option>
        {HOUR_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minuto" value={minute} onChange={event => update(hour, event.target.value)}>
        <option value="">Min</option>
        {MINUTE_OPTIONS.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
    </div>
  );
}

function Select({ value, values, placeholder = 'Todos', labels, required = false, showPlaceholder = true, onChange }: {
  value: string;
  values: readonly string[];
  placeholder?: string;
  labels?: Map<string, string>;
  required?: boolean;
  showPlaceholder?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} required={required} onChange={event => onChange(event.target.value)}>
      {showPlaceholder !== false && <option value="">{placeholder}</option>}
      {values.map(item => <option key={item} value={item}>{labels?.get(item) || item}</option>)}
    </select>
  );
}

function StatusSelect({ value, onChange }: {
  value: DispatchStatus;
  onChange: (value: DispatchStatus) => void;
}) {
  return (
    <select className={`statusSelect ${statusClass(value)}`} value={value} onChange={event => onChange(event.target.value as DispatchStatus)}>
      {STATUS.map(item => <option key={item} value={item}>{item}</option>)}
    </select>
  );
}

function statusClass(status: DispatchStatus) {
  return status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function SelectWithCreate({ value, values, placeholder, createLabel, createPlaceholder = 'Novo cadastro', required = false, onChange, onCreate }: {
  value: string;
  values: readonly string[];
  placeholder: string;
  createLabel: string;
  createPlaceholder?: string;
  required?: boolean;
  onChange: (value: string) => void;
  onCreate: (value: string) => Promise<void> | void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitCreate() {
    const clean = draft.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await onCreate(clean);
      setDraft('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="selectCreate">
        <input
          autoFocus
          required
          value={draft}
          placeholder={createPlaceholder}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitCreate();
            }
          }}
        />
        <button type="button" className="btn primary small" disabled={busy || !draft.trim()} onClick={submitCreate}>{busy ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn ghost small" onClick={() => setCreating(false)}>Cancelar</button>
      </div>
    );
  }

  return (
    <div className="selectCreate">
      <Select required={required} value={value} values={values} placeholder={placeholder} onChange={onChange} />
      <button type="button" className="btn ghost small" onClick={() => setCreating(true)}>{createLabel}</button>
    </div>
  );
}

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = richTextHtml(value);
  }, [value]);

  function syncValue() {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(sanitizeRichHtml(editor.innerHTML));
  }

  return (
    <div
      ref={editorRef}
      className="contentEditor"
      contentEditable
      role="textbox"
      aria-multiline="true"
      suppressContentEditableWarning
      onInput={syncValue}
      onBlur={event => {
        const clean = sanitizeRichHtml(event.currentTarget.innerHTML);
        event.currentTarget.innerHTML = clean;
        onChange(clean);
      }}
      onPaste={event => {
        const html = event.clipboardData.getData('text/html');
        const text = event.clipboardData.getData('text/plain');
        if (!html && !text) return;
        event.preventDefault();
        insertHtmlAtSelection(richTextHtml(html || text));
        syncValue();
      }}
    />
  );
}

function CatalogManager({ title, description, values, dates, onAdd, onUpdate, onRemove }: {
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
  const datalistId = `catalog-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\W+/g, '-')}`;

  useEffect(() => {
    setSelected(current => current.filter(item => values.includes(item)));
  }, [values]);

  function submitNew(event: FormEvent) {
    event.preventDefault();
    onAdd(newValue);
    setNewValue('');
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
    setSelected(checked ? visibleValues : []);
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
          onChange={event => setQuery(event.target.value)}
        />
        <datalist id={datalistId}>
          {values.map(value => <option key={value} value={value} />)}
        </datalist>
        <select value={order} onChange={event => setOrder(event.target.value as typeof order)}>
          <option value="name-asc">Nome A-Z</option>
          <option value="name-desc">Nome Z-A</option>
          <option value="created-desc">Criação recente</option>
          <option value="created-asc">Criação antiga</option>
          <option value="updated-desc">Alteração recente</option>
          <option value="updated-asc">Alteração antiga</option>
        </select>
      </div>
      <div className="catalogDateFilters">
        <label><span>Criação de</span><input type="date" value={createdFrom} onChange={event => setCreatedFrom(event.target.value)} /></label>
        <label><span>Criação até</span><input type="date" value={createdTo} onChange={event => setCreatedTo(event.target.value)} /></label>
        <label><span>Alteração de</span><input type="date" value={updatedFrom} onChange={event => setUpdatedFrom(event.target.value)} /></label>
        <label><span>Alteração até</span><input type="date" value={updatedTo} onChange={event => setUpdatedTo(event.target.value)} /></label>
      </div>
      {values.length > 0 && (
        <div className="catalogBulk">
          <label>
            <input
              type="checkbox"
              checked={visibleValues.length > 0 && visibleValues.every(value => selectedSet.has(value))}
              onChange={event => toggleAll(event.target.checked)}
            />
            Selecionar visíveis
          </label>
          <button type="button" className="btn dangerSoft small" disabled={!selected.length} onClick={() => setConfirming(true)}>
            Remover selecionados
          </button>
        </div>
      )}
      {confirming && (
        <div className="confirmStrip">
          <strong>Remover {selected.length} cadastro(s)?</strong>
          <span>Registros que usam esses valores ficarão em branco.</span>
          <div>
            <button type="button" className="btn ghost small" onClick={() => setConfirming(false)}>Cancelar</button>
            <button type="button" className="btn dangerStrong small" onClick={confirmRemove}>Confirmar exclusão</button>
          </div>
        </div>
      )}
      <div className="catalogList">
        {!values.length && <div className="empty smallEmpty">Nada cadastrado ainda.</div>}
        {values.length > 0 && !visibleValues.length && <div className="empty smallEmpty">Nenhum cadastro encontrado.</div>}
        {visibleValues.map(value => (
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
    </div>
  );
}

function Field({ label, wide, asGroup = false, children }: { label: string; wide?: boolean; asGroup?: boolean; children: ReactNode }) {
  const className = `field ${wide ? 'wide' : ''}`;
  if (asGroup) return <div className={className}><span>{label}</span>{children}</div>;
  return <label className={className}><span>{label}</span>{children}</label>;
}

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="modalHead"><h2>{title}</h2><button type="button" onClick={onClose}>Fechar</button></div>;
}

function ModalFoot({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return (
    <div className="modalFoot">
      <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
      <button className="btn primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
    </div>
  );
}

function AttachmentPicker({ attachments, onAdd, onRemove }: {
  attachments: Dispatch['attachments'];
  onAdd: (attachments: Dispatch['attachments']) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage('');
    try {
      const allFiles = [...files];
      const invalidSize = allFiles.filter(file => file.size > MAX_ATTACHMENT_SIZE);
      const images = allFiles.filter(file => ['image/png', 'image/jpeg'].includes(file.type) && file.size <= MAX_ATTACHMENT_SIZE);
      if (invalidSize.length) {
        setMessage(`${invalidSize.length} imagem(ns) acima de 20 MB não foram anexadas.`);
      }
      onAdd(await Promise.all(images.map(fileToAttachment)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachmentPicker">
      <label className="attachmentInput">
        <input
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          multiple
          onChange={event => {
            handleFiles(event.target.files);
            event.currentTarget.value = '';
          }}
        />
        <span>{busy ? 'Carregando imagens...' : 'Anexar PNG/JPG/JPEG até 20 MB'}</span>
      </label>
      {message && <small className="attachmentMessage">{message}</small>}
      {attachments.length > 0 && (
        <div className="attachmentGrid">
          {attachments.map(attachment => (
            <div className="attachmentItem" key={attachment.id}>
              <img src={attachment.dataUrl} alt={attachment.name} />
              <div>
                <strong>{attachment.name}</strong>
                <small>{formatBytes(attachment.size)}</small>
              </div>
              <div className="attachmentActions">
                <a href={attachment.dataUrl} download={attachment.name}>Baixar</a>
                <button type="button" className="danger" onClick={() => onRemove(attachment.id)}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpreadsheetAttachmentPicker({ attachment, onChange, onRemove }: {
  attachment: FileAttachment | null;
  onChange: (attachment: FileAttachment) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage('');
    try {
      if (!isExcelFile(file)) {
        setMessage('Anexe apenas arquivos .xls ou .xlsx.');
        return;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setMessage('A base de disparo precisa ter até 20 MB.');
        return;
      }
      onChange(await fileToAttachment(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="attachmentPicker">
      <label className="attachmentInput">
        <input
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={event => {
            handleFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <span>{busy ? 'Carregando base de disparo...' : attachment ? 'Trocar base de disparo' : 'Anexar base XLS/XLSX até 20 MB'}</span>
      </label>
      {message && <small className="attachmentMessage">{message}</small>}
      {attachment && (
        <div className="attachmentGrid single">
          <div className="attachmentItem">
            <div className="fileIcon">XLS</div>
            <div>
              <strong>{attachment.name}</strong>
              <small>{formatBytes(attachment.size)}</small>
            </div>
            <div className="attachmentActions">
              <a href={attachment.dataUrl} download={attachment.name}>Baixar</a>
              <button type="button" className="danger" onClick={onRemove}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpcomingList({ dispatches, bases }: { dispatches: Dispatch[]; bases: BaseRule[] }) {
  if (!dispatches.length) return <div className="empty smallEmpty">Nenhum disparo nos próximos 15 dias.</div>;
  return (
    <div className="dailyList upcomingScroll">
      {dispatches.map(dispatch => {
        const validation = dispatchValidation(dispatch, bases);
        return (
          <div className="dailyItem" key={dispatch.id}>
            <strong>{fmtDate(dispatch.date)}{dispatch.time ? ` - ${dispatch.time}` : ''} - {dispatch.campaign || 'Sem campanha'}</strong>
            <span>{dispatch.audience || 'Sem público'} | {dispatch.status}</span>
            <ValidationBadge validation={validation} />
          </div>
        );
      })}
    </div>
  );
}

function IssueList({ items }: { items: string[] }) {
  if (!items.length) return <div className="empty smallEmpty">Nenhuma pendência de cadastro encontrada.</div>;
  return (
    <div className="dailyList">
      {items.map(item => <div className="dailyItem issue" key={item}>{item}</div>)}
    </div>
  );
}

function CalendarView({ month, dispatches, onView, onDayView }: {
  month: string;
  dispatches: Dispatch[];
  onView: (dispatch: Dispatch) => void;
  onDayView: (day: string) => void;
}) {
  const days = calendarDays(month);
  const today = todayISO();
  const byDate = new Map<string, Dispatch[]>();
  for (const dispatch of dispatches) {
    byDate.set(dispatch.date, [...(byDate.get(dispatch.date) || []), dispatch]);
  }

  return (
    <div className="calendar">
      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div className="calendarWeekday" key={day}>{day}</div>)}
      {days.map(day => {
        const items = byDate.get(day) || [];
        const outside = !day.startsWith(month);
        const previewItems = items.slice(0, 3);
        const hiddenCount = Math.max(0, items.length - previewItems.length);
        return (
          <div
            role="button"
            tabIndex={0}
            className={`calendarDay ${outside ? 'outside' : ''} ${day === today ? 'today' : ''}`}
            key={day}
            onClick={() => onDayView(day)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onDayView(day);
              }
            }}
          >
            <div className="calendarDate">
              <strong>{Number(day.slice(8, 10))}</strong>
              {items.length > 0 && <span>{items.length}</span>}
            </div>
            <div className="calendarEvents">
              {previewItems.map(dispatch => (
                <button
                  type="button"
                  className={`calendarEvent ${dispatch.channel || 'email'} ${statusClass(dispatch.status)}`}
                  key={dispatch.id}
                  onClick={event => {
                    event.stopPropagation();
                    onView(dispatch);
                  }}
                  title={`${channelName(dispatch.channel || 'email')} - ${dispatch.campaign || 'Sem campanha'}`}
                >
                  <span><i aria-hidden="true" />{dispatch.time || '--:--'}</span>
                  <strong>{dispatch.campaign || dispatch.templateName || 'Sem campanha'}</strong>
                  <small>{channelName(dispatch.channel || 'email')}</small>
                </button>
              ))}
              {hiddenCount > 0 && <span className="calendarMore">+ {hiddenCount} disparo(s). Clique no dia para ver todos.</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarDayDetails({ dispatches, onView, onEdit }: {
  dispatches: Dispatch[];
  onView: (dispatch: Dispatch) => void;
  onEdit: (dispatch: Dispatch) => void;
}) {
  if (!dispatches.length) return <div className="empty">Nenhum disparo neste dia.</div>;
  return (
    <div className="dayDispatchList">
      {dispatches.map(dispatch => (
        <div className={`dayDispatchItem ${dispatch.channel || 'email'}`} key={dispatch.id}>
          <div className="dayDispatchTime">
            <strong>{dispatch.time || '--:--'}</strong>
            <span>{channelName(dispatch.channel || 'email')}</span>
          </div>
          <div className="dayDispatchInfo">
            <h3>{dispatch.campaign || dispatch.templateName || 'Sem campanha'}</h3>
            <p>{dispatch.audience || 'Sem público'} | {dispatch.status}</p>
            <div className="dayDispatchMeta">
              <span>Template: {dispatch.templateName || '-'}</span>
              <span>Integração: {dispatch.chip || '-'}</span>
              <span>Responsável: {dispatch.responsible || '-'}</span>
            </div>
            {dispatch.description && <small>{dispatch.description}</small>}
          </div>
          <div className="actions">
            <button type="button" onClick={() => onView(dispatch)}>Ver completo</button>
            <button type="button" onClick={() => onEdit(dispatch)}>Editar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailItem({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  const isPrimitive = typeof value === 'string' || typeof value === 'number';
  return (
    <div className={`detailItem ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {isPrimitive ? <strong>{value || '-'}</strong> : <div className="detailValue">{value || '-'}</div>}
    </div>
  );
}

function RichContentPreview({ html }: { html: string }) {
  if (!html.trim()) return <>-</>;
  return <div className="richContentPreview" dangerouslySetInnerHTML={{ __html: richTextHtml(html) }} />;
}

function DispatchDetails({ dispatch, base, validation, conflicts, duplicateCount }: {
  dispatch: Dispatch;
  base?: BaseRule;
  validation: ReturnType<typeof dispatchValidation>;
  conflicts: Dispatch[];
  duplicateCount: number;
}) {
  const displayName = dispatchDisplayName(dispatch);
  return (
    <div className="detailContent">
      <div className="detailHero">
        <div>
          <span className={`channelBadge ${dispatch.channel || 'email'}`}>{channelName(dispatch.channel || 'email')}</span>
          <h3>{displayName || 'Disparo sem nome'}</h3>
          <p>{dispatch.campaign || 'Sem campanha'}{dispatch.audience ? ` para ${dispatch.audience}` : ''}</p>
        </div>
        <ValidationBadge validation={validation} />
      </div>

      <div className="detailGrid">
        <DetailItem label="Data de disparo" value={fmtDate(dispatch.date)} />
        <DetailItem label="Hora do disparo" value={dispatchTime(dispatch.time)} />
        <DetailItem label="Criado em" value={fmtDate(isoDate(dispatch.createdAt))} />
        <DetailItem label="Status" value={<span className={`statusText ${statusClass(dispatch.status)}`}>{dispatch.status}</span>} />
        <DetailItem label="Nome do template" value={dispatch.templateName || '-'} />
        <DetailItem label="Integração" value={dispatch.chip || '-'} />
        <DetailItem label="Campanha" value={dispatch.campaign || '-'} />
        <DetailItem label="Público" value={dispatch.audience || '-'} />
        <DetailItem label="Responsável" value={dispatch.responsible || '-'} />
        <DetailItem label="Base principal" value={base?.mainBase || 'Sem base'} wide />
        <DetailItem label="Bases excluídas" value={base?.excludedBases || 'Nenhuma exclusão configurada'} wide />
        <DetailItem label="Assunto" value={dispatch.subject || '-'} wide />
        <DetailItem label="Conteúdo do e-mail (corpo)" value={<RichContentPreview html={dispatch.body} />} wide />
        <DetailItem label="Descrição" value={dispatch.description || '-'} wide />
        {dispatch.attachments.length > 0 && (
          <DetailItem label="Anexos" value={<AttachmentPreview attachments={dispatch.attachments} />} wide />
        )}
        {dispatch.channel === 'html_email' && (
          <DetailItem label="HTML salvo" value={<HtmlPreviewBlock html={dispatch.htmlContent} />} wide />
        )}
        <DetailItem label="Alertas" value={validation.issues.length ? validation.issues.join('; ') : 'Sem alertas'} wide />
        {conflicts.length > 0 && (
          <DetailItem
            label="Sobreposição"
            value={`${conflicts.length} disparo(s) para o mesmo público em data próxima`}
            wide
          />
        )}
        {duplicateCount > 0 && (
          <DetailItem
            label="Nome duplicado"
            value={`Mesmo nome em ${duplicateCount} outro(s) disparo(s)`}
            wide
          />
        )}
      </div>
    </div>
  );
}

function HtmlPreviewBlock({ html }: { html: string }) {
  return (
    <div className="htmlPreviewBlock">
      <button
        type="button"
        className="btn primary small"
        disabled={!html.trim()}
        onClick={() => navigator.clipboard.writeText(html)}
      >
        Copiar HTML
      </button>
      <pre className="htmlPreview">{html || '-'}</pre>
    </div>
  );
}

function AttachmentPreview({ attachments }: { attachments: Dispatch['attachments'] }) {
  return (
    <div className="attachmentGrid previewOnly">
      {attachments.map(attachment => (
        <div className="attachmentItem" key={attachment.id}>
          <img src={attachment.dataUrl} alt={attachment.name} />
          <div>
            <strong>{attachment.name}</strong>
            <small>{formatBytes(attachment.size)}</small>
          </div>
          <div className="attachmentActions">
            <a href={attachment.dataUrl} download={attachment.name}>Baixar</a>
          </div>
        </div>
      ))}
    </div>
  );
}

function DispatchTable({ dispatches, bases, overlaps, duplicateNames, onView, onEdit, onDelete, onStatus }: {
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

function BaseTable({ bases, onEdit, onDelete }: {
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

function ValidationBadge({ validation }: { validation: ReturnType<typeof baseValidation> }) {
  const label = validation.level === 'green' ? 'Validada' : validation.level === 'red' ? 'Risco' : 'Conferir';
  return <span className={`validation ${validation.level}`} title={validation.issues.join(' | ')}>{label}</span>;
}

function LoginScreen({ error, onLogin }: {
  error: string;
  onLogin: (email: string, password: string, keepConnected: boolean) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepConnected, setKeepConnected] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onLogin(email, password, keepConnected);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authPage">
      <form className="authCard" onSubmit={submit}>
        <img className="authLogo" src="/unigran-logo.png" alt="UNIGRAN" />
        <div>
          <h1>Entrar no planejamento</h1>
          <p>Acesso restrito aos e-mails autorizados do setor.</p>
        </div>
        {error && <div className="authError">{error}</div>}
        <label className="field">
          <span>E-mail</span>
          <input
            autoFocus
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </label>
        <label className="rememberLogin">
          <input
            type="checkbox"
            checked={keepConnected}
            onChange={event => setKeepConnected(event.target.checked)}
          />
          Manter conectado neste navegador
        </label>
        <button className="btn primary authButton" disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  );
}
