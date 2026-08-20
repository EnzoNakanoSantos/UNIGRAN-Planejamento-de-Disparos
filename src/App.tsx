import type { FormEvent } from 'react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUser, loadState, saveState, sendCalendarToN8n, signIn, type AuthSession } from './api';
import { addDaysISO, baseValidation, dispatchValidation, fmtDate, isBaseStale, overlapMap, todayISO, uid } from './logic';
import { AUTH_STORAGE_KEY, CHIP_OPTIONS, DISPATCH_FORM_STATUS, EXCEL_TYPES, MAX_ATTACHMENT_SIZE, RESPONSIBLE_BY_EMAIL } from './config/dispatch';
import { emptyBase, emptyDispatch, defaultFilters } from './utils/factories';
import { calendarDays, channelName, dispatchDisplayName, dispatchSortValue, dispatchTime, duplicateDispatchNameMap, duplicateNameCount, fileToAttachment, formatBytes, isExcelFile, isoDate, missingBaseFields, missingDispatchFields, monthLabel, normalizeState, responsibleForEmail, richTextHtml, shiftMonth, statusClass, unique } from './utils/app';
import type { AppState, BaseRule, BaseSort, CatalogKey, Dispatch, DispatchChannel, DispatchChip, DispatchSortField, DispatchStatus, FileAttachment, FilterKey, Modal, SortDirection, Tab } from './types';
import { STATUS } from './types';
import { Login } from './features/auth/Login';
import { CatalogManager } from './features/catalogs/CatalogManager';
import { RichTextEditor } from './features/dispatches/RichTextEditor';
import { CalendarDayDetails, CalendarView } from './features/calendar/CalendarView';
import { ValidationBadge } from './components/feedback/ValidationBadge';
import { BaseTable } from './features/bases/BaseTable';
import { BrazilianDatePicker, Metric, Select, SelectWithCreate, StatusSelect, TwentyFourHourPicker } from './components/forms/Controls';
import { DispatchTable } from './features/dispatches/DispatchTable';
import { DispatchDetails } from './features/dispatches/DispatchDetails';
import { ConfirmDialog, Field, ModalFoot, ModalHead } from './components/modal/ModalParts';
import { AttachmentPicker, SpreadsheetAttachmentPicker } from './components/forms/AttachmentPickers';
import { IssueList, UpcomingList } from './features/dispatches/DashboardLists';
import { useCalendar } from './features/calendar/useCalendar';
import { useHeaderMenu } from './hooks/useHeaderMenu';
import { OverviewDashboard } from './features/overview/OverviewDashboard';
import { dispatchReadinessChecks, missingReadyDispatchFields, shouldValidateReadiness } from '../shared/dispatch-readiness.js';
import { dispatchSnapshot, hasUnsavedDispatchChanges } from '../shared/dirty-state.js';
import { duplicateDispatchDraft } from '../shared/dispatch-duplicate.js';

type FeedbackType = 'success' | 'warning' | 'error' | 'info';
type Feedback = { type: FeedbackType; message: string };
type PendingDiscardAction = { run: () => void };
type DispatchFormMode = 'create' | 'edit';

const LAST_RESPONSIBLE_STORAGE_KEY = 'unigran-last-responsible-by-channel';

function defaultFiltersByChannel(): Record<DispatchChannel, ReturnType<typeof defaultFilters>> {
  return {
    email: defaultFilters(),
    whatsapp: defaultFilters(),
    html_email: defaultFilters()
  };
}

export default function App() {
  const [state, setState] = useState<AppState>({ dispatches: [], bases: [], campaigns: [], audiences: [], responsibles: [] });
  const stateRef = useRef(state);
  const saveQueueRef = useRef(Promise.resolve(true));
  const saveVersionRef = useRef(0);
  const activeSavesRef = useRef(0);
  const calendarOperationsRef = useRef(new Set<string>());
  const initialDispatchSnapshotRef = useRef('');
  const initialDispatchRef = useRef<Dispatch | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const { headerMenuOpen, setHeaderMenuOpen } = useHeaderMenu();
  const [editingDispatch, setEditingDispatch] = useState<Dispatch>(emptyDispatch());
  const [editingDispatchMode, setEditingDispatchMode] = useState<DispatchFormMode>('create');
  const [viewingDispatch, setViewingDispatch] = useState<Dispatch | null>(null);
  const [viewingDispatchFromCalendar, setViewingDispatchFromCalendar] = useState(false);
  const [editingBase, setEditingBase] = useState<BaseRule>(emptyBase());
  const [dispatchSortField, setDispatchSortField] = useState<DispatchSortField>('dispatchDate');
  const [dispatchSortDirection, setDispatchSortDirection] = useState<SortDirection>('asc');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarDeleteTarget, setCalendarDeleteTarget] = useState<Dispatch | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [dispatchFieldErrors, setDispatchFieldErrors] = useState<string[]>([]);
  const [pendingDiscardAction, setPendingDiscardAction] = useState<PendingDiscardAction | null>(null);
  const [suggestedFields, setSuggestedFields] = useState<string[]>([]);
  const [filtersByChannel, setFiltersByChannel] = useState(defaultFiltersByChannel);
  const [baseQuery, setBaseQuery] = useState('');
  const [baseSort, setBaseSort] = useState<BaseSort>('name');
  const activeChannel: DispatchChannel = tab === 'whatsapp' ? 'whatsapp' : tab === 'html_email' ? 'html_email' : 'email';
  const filters = filtersByChannel[activeChannel];
  const deferredFiltersQ = useDeferredValue(filters.q);
  const deferredBaseQuery = useDeferredValue(baseQuery);

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!feedback || feedback.type !== 'success') return;
    const timeout = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    if (!modal && !calendarDeleteTarget && !pendingDiscardAction) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (pendingDiscardAction) {
        continueEditing();
        return;
      }
      if (calendarDeleteTarget) {
        setCalendarDeleteTarget(null);
        return;
      }
      requestModalClose();
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [modal, calendarDeleteTarget, pendingDiscardAction, editingDispatch]);

  const isDispatchDirty = modal === 'dispatch' && hasUnsavedDispatchChanges(editingDispatch, initialDispatchSnapshotRef.current);

  useEffect(() => {
    if (!isDispatchDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDispatchDirty]);

  function showFeedback(type: FeedbackType, message: string) {
    setFeedback(message ? { type, message } : null);
  }

  function setError(message: string) {
    showFeedback('error', message);
  }

  function setSavedMessage(message: string) {
    showFeedback('success', message);
  }

  function clearFeedback() {
    setFeedback(null);
  }

  function readLastResponsible(channel: DispatchChannel) {
    try {
      const data = JSON.parse(window.localStorage.getItem(LAST_RESPONSIBLE_STORAGE_KEY) || '{}');
      return String(data?.[channel] || '');
    } catch {
      return '';
    }
  }

  function rememberLastResponsible(channel: DispatchChannel, responsible: string) {
    const clean = responsible.trim();
    if (!clean) return;
    try {
      const data = JSON.parse(window.localStorage.getItem(LAST_RESPONSIBLE_STORAGE_KEY) || '{}');
      window.localStorage.setItem(LAST_RESPONSIBLE_STORAGE_KEY, JSON.stringify({ ...data, [channel]: clean }));
    } catch {
      window.localStorage.setItem(LAST_RESPONSIBLE_STORAGE_KEY, JSON.stringify({ [channel]: clean }));
    }
  }

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
    requestDiscardOrRun(logoutCore);
  }

  function logoutCore() {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    setSession(null);
    setAppState({ dispatches: [], bases: [], campaigns: [], audiences: [], responsibles: [] });
    clearDispatchSnapshot();
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

    if (calendarOperationsRef.current.has(dispatch.id)) return;
    const missing = missingReadyDispatchFields(dispatch);
    if (missing.length) {
      setError(`Não foi possível sincronizar com Google Calendar: informe ${missing.join(', ')}.`);
      return;
    }
    calendarOperationsRef.current.add(dispatch.id);

    setError('');
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
      setSavedMessage('Evento sincronizado com Google Calendar.');
    } catch (err) {
      setSavedMessage('');
      setError(err instanceof Error ? err.message : 'Não foi possível sincronizar com Google Calendar.');
    } finally {
      calendarOperationsRef.current.delete(dispatch.id);
    }
  }

  async function removeDispatchFromCalendar(dispatch: Dispatch) {
    if (!session?.accessToken) {
      setError('Faça login para remover o disparo do calendário.');
      return;
    }
    if (calendarOperationsRef.current.has(dispatch.id)) return;
    calendarOperationsRef.current.add(dispatch.id);
    const previousEventId = dispatch.googleCalendarEventId || '';

    setError('');
    setCalendarDeleteTarget(null);
    const current = stateRef.current;
    setAppState({
      ...current,
      dispatches: current.dispatches.map(item => item.id === dispatch.id
        ? { ...item, googleCalendarEventId: '' }
        : item)
    });
    setViewingDispatch(item => item?.id === dispatch.id
      ? { ...item, googleCalendarEventId: '' }
      : item);
    setSavedMessage('Disparo removido do Google Calendar pelo n8n.');

    try {
      const result = await sendCalendarToN8n(dispatch.id, session.accessToken, 'delete');
      const latest = stateRef.current;
      setAppState({
        ...latest,
        revision: result.revision,
        dispatches: latest.dispatches.map(item => item.id === dispatch.id
          ? { ...item, googleCalendarEventId: '' }
          : item)
      });
    } catch (err) {
      const latest = stateRef.current;
      setAppState({
        ...latest,
        dispatches: latest.dispatches.map(item => item.id === dispatch.id
          ? { ...item, googleCalendarEventId: previousEventId }
          : item)
      });
      setViewingDispatch(item => item?.id === dispatch.id
        ? { ...item, googleCalendarEventId: previousEventId }
        : item);
      setSavedMessage('');
      setError(err instanceof Error ? err.message : 'Não foi possível enviar ao n8n.');
    } finally {
      calendarOperationsRef.current.delete(dispatch.id);
    }
  }

  async function persist(next: AppState, deletedCatalog?: { key: CatalogKey; value: string } | { key: CatalogKey; value: string }[]) {
    if (!session?.accessToken) {
      setError('Faça login para salvar alterações.');
      return false;
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
        return false;
      } finally {
        activeSavesRef.current -= 1;
        if (activeSavesRef.current === 0) setSaving(false);
      }
      return true;
    };

    saveQueueRef.current = saveQueueRef.current.then(runSave, runSave);
    return await saveQueueRef.current;
  }

  function setAppState(next: AppState) {
    stateRef.current = next;
    setState(next);
  }

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
      if (deferredFiltersQ && !text.includes(deferredFiltersQ.toLowerCase())) return false;
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
  }, [baseById, channelDispatches, deferredFiltersQ, dispatchSortDirection, dispatchSortField, filters, overlaps, state.bases]);

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
    const query = deferredBaseQuery.trim().toLowerCase();
    const list = state.bases.filter(base => {
      if (!query) return true;
      return `${base.campaign} ${base.mainBase} ${base.expectedAction} ${base.responsible}`.toLowerCase().includes(query);
    });
    return list.sort((a, b) => {
      if (baseSort === 'date-desc') return (b.lastUpdated || '').localeCompare(a.lastUpdated || '');
      if (baseSort === 'date-asc') return (a.lastUpdated || '').localeCompare(b.lastUpdated || '');
      return `${a.mainBase} ${a.campaign}`.localeCompare(`${b.mainBase} ${b.campaign}`, 'pt-BR');
    });
  }, [baseSort, deferredBaseQuery, state.bases]);
  const { calendarMonth, setCalendarMonth, viewingDay, setViewingDay, calendarDispatches, viewingDayDispatches } = useCalendar(state.dispatches);
  const detailChannelDispatches = useMemo(
    () => viewingDispatch
      ? state.dispatches.filter(dispatch => (dispatch.channel || 'email') === (viewingDispatch.channel || 'email'))
      : [],
    [state.dispatches, viewingDispatch]
  );
  const detailOverlaps = useMemo(() => overlapMap(detailChannelDispatches), [detailChannelDispatches]);
  const detailDuplicateNames = useMemo(() => duplicateDispatchNameMap(detailChannelDispatches), [detailChannelDispatches]);

  function updateFilter(key: FilterKey, value: string | boolean) {
    setFiltersByChannel(current => ({
      ...current,
      [activeChannel]: { ...current[activeChannel], [key]: value }
    }));
  }

  function setPeriod(days: number) {
    const start = todayISO();
    setFiltersByChannel(current => ({
      ...current,
      [activeChannel]: { ...current[activeChannel], start, end: addDaysISO(start, days) }
    }));
  }

  function clearCurrentFilters() {
    setFiltersByChannel(current => ({ ...current, [activeChannel]: defaultFilters() }));
  }

  function setPeriodPreset(value: string) {
    if (!value) {
      updateFilter('start', '');
      updateFilter('end', '');
      return;
    }
    setPeriod(Number(value));
  }

  function navigate(nextTab: Tab) {
    if (nextTab === tab) return;
    requestDiscardOrRun(() => navigateCore(nextTab));
  }

  function navigateCore(nextTab: Tab) {
    setTab(nextTab);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openDispatch(dispatch?: Dispatch) {
    const latest = dispatch
      ? stateRef.current.dispatches.find(item => item.id === dispatch.id) || dispatch
      : null;
    const nextDispatch = latest
      ? { ...latest }
      : { ...emptyDispatch(activeChannel), responsible: sessionResponsible || readLastResponsible(activeChannel) };
    setEditingDispatch(nextDispatch);
    setEditingDispatchMode(latest ? 'edit' : 'create');
    setDispatchSnapshot(nextDispatch);
    setDispatchFieldErrors([]);
    setSuggestedFields([]);
    setModal('dispatch');
  }

  function duplicateDispatch(dispatch: Dispatch) {
    const latest = stateRef.current.dispatches.find(item => item.id === dispatch.id) || dispatch;
    const now = new Date().toISOString();
    const duplicate = duplicateDispatchDraft(latest, { id: uid('disparo'), now }) as Dispatch;
    requestDiscardOrRun(() => {
      setViewingDispatch(null);
      setViewingDispatchFromCalendar(false);
      setViewingDay('');
      setEditingDispatch(duplicate);
      setEditingDispatchMode('create');
      setDispatchSnapshot(duplicate);
      setDispatchFieldErrors([]);
      setSuggestedFields([]);
      setModal('dispatch');
      setTab(duplicate.channel || 'email');
    });
  }

  function openDispatchForDate(date: string) {
    const nextDispatch = { ...emptyDispatch('email'), date, responsible: sessionResponsible || readLastResponsible('email') };
    setEditingDispatch(nextDispatch);
    setEditingDispatchMode('create');
    setDispatchSnapshot(nextDispatch);
    setDispatchFieldErrors([]);
    setSuggestedFields([]);
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
    clearDispatchSnapshot();
    setDispatchFieldErrors([]);
    setSuggestedFields([]);
    setPendingDiscardAction(null);
  }

  function requestModalClose() {
    requestDiscardOrRun(closeModal);
  }

  function requestDiscardOrRun(run: () => void) {
    if (isDispatchDirty) {
      setPendingDiscardAction({ run });
      return;
    }
    run();
  }

  function continueEditing() {
    setPendingDiscardAction(null);
  }

  function discardChanges() {
    const action = pendingDiscardAction;
    setPendingDiscardAction(null);
    if (action) action.run();
  }

  function setDispatchSnapshot(dispatch: Dispatch) {
    initialDispatchRef.current = { ...dispatch, attachments: [...(dispatch.attachments || [])] };
    initialDispatchSnapshotRef.current = dispatchSnapshot(dispatch);
  }

  function clearDispatchSnapshot() {
    initialDispatchRef.current = null;
    initialDispatchSnapshotRef.current = '';
  }

  function changeEditingDispatchChannel(channel: DispatchChannel) {
    if (editingDispatch.channel === channel) return;
    const run = () => {
      const baseDispatch = initialDispatchRef.current || editingDispatch;
      setEditingDispatch({ ...baseDispatch, channel });
      setDispatchFieldErrors([]);
      setSuggestedFields([]);
    };
    requestDiscardOrRun(run);
  }

  function updateEditingCampaign(campaign: string) {
    const matchingBases = state.bases.filter(base => base.campaign === campaign);
    if (!editingDispatch.baseId && matchingBases.length === 1) {
      setEditingDispatch({ ...editingDispatch, campaign, baseId: matchingBases[0].id });
      setSuggestedFields(['base']);
      return;
    }
    setEditingDispatch({ ...editingDispatch, campaign });
    setSuggestedFields([]);
  }

  function updateEditingBase(baseId: string) {
    const base = state.bases.find(item => item.id === baseId);
    if (base && !editingDispatch.campaign) {
      setEditingDispatch({ ...editingDispatch, baseId, campaign: base.campaign });
      setSuggestedFields(['campanha']);
      return;
    }
    setEditingDispatch({ ...editingDispatch, baseId });
    setSuggestedFields([]);
  }

  async function submitDispatch(event: FormEvent) {
    event.preventDefault();
    const responsible = sessionResponsible || editingDispatch.responsible.trim();
    const draft = { ...editingDispatch, responsible };
    const missing = shouldValidateReadiness(draft.status) ? missingReadyDispatchFields(draft) : [];
    if (missing.length) {
      setDispatchFieldErrors(missing);
      setError(`Complete o disparo antes de marcar como Pronto para disparo: ${missing.join(', ')}.`);
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
    const wasEditing = editingDispatchMode === 'edit';
    const next = wasEditing
      ? state.dispatches.map(dispatch => dispatch.id === item.id ? item : dispatch)
      : [...state.dispatches, item];
    const saved = await persist({
      ...state,
      dispatches: next,
      campaigns: unique([...state.campaigns, item.campaign]),
      audiences: unique([...state.audiences, item.audience]),
      responsibles: unique([...state.responsibles, item.responsible])
    });
    if (!saved) return;
    rememberLastResponsible(item.channel, item.responsible);
    setDispatchSnapshot(item);
    setDispatchFieldErrors([]);
    setSavedMessage(dispatchSavedFeedback(item.status, wasEditing));
    closeModal();
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
    const wasEditing = Boolean(editingBase.id);
    const saved = await persist({
      ...state,
      bases: next,
      campaigns: unique([...state.campaigns, item.campaign]),
      responsibles: unique([...state.responsibles, item.responsible])
    });
    if (!saved) return;
    setSavedMessage(wasEditing ? 'Base atualizada.' : 'Cadastro criado.');
    closeModal();
  }

  async function changeStatus(id: string, status: DispatchStatus) {
    const current = stateRef.current;
    const target = current.dispatches.find(dispatch => dispatch.id === id);
    if (target && shouldValidateReadiness(status)) {
      const missing = missingReadyDispatchFields({ ...target, status });
      if (missing.length) {
        setError(`Não foi possível marcar como pronto: informe ${missing.join(', ')}.`);
        return;
      }
    }
    const next = current.dispatches.map(dispatch =>
      dispatch.id === id ? { ...dispatch, status, updatedAt: new Date().toISOString() } : dispatch
    );
    const saved = await persist({ ...current, dispatches: next });
    if (saved) setSavedMessage(statusFeedback(status));
  }

  function setEditingDispatchStatus(status: DispatchStatus) {
    if (shouldValidateReadiness(status)) {
      const responsible = sessionResponsible || editingDispatch.responsible.trim();
      const missing = missingReadyDispatchFields({ ...editingDispatch, responsible, status });
      if (missing.length) {
        setDispatchFieldErrors(missing);
        setError(`Complete o disparo antes de marcar como Pronto para disparo: ${missing.join(', ')}.`);
        return;
      }
    }
    setDispatchFieldErrors([]);
    setError('');
    setEditingDispatch({ ...editingDispatch, status });
  }

  function dispatchSavedFeedback(status: DispatchStatus, wasEditing: boolean) {
    if (status === 'Pronto para disparo') return 'Disparo marcado como pronto.';
    if (status === 'Planejado' || status === 'Em produção') return wasEditing ? 'Disparo atualizado.' : 'Rascunho salvo.';
    return wasEditing ? 'Disparo atualizado.' : 'Disparo salvo.';
  }

  function statusFeedback(status: DispatchStatus) {
    if (status === 'Pronto para disparo') return 'Disparo marcado como pronto.';
    if (status === 'Enviado') return 'Disparo marcado como enviado.';
    return 'Disparo atualizado.';
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
    const saved = await persist({ ...state, [key]: unique([...state[key], clean]) });
    if (saved) setSavedMessage('Cadastro criado.');
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
    const saved = await persist(nextState, { key, value: oldValue });
    if (saved) setSavedMessage('Cadastro atualizado.');
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
    const saved = await persist(nextState, selected.map(value => ({ key, value })));
    if (saved) setSavedMessage('Cadastro removido.');
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
    return <Login error={authError} onLogin={login} />;
  }

  const pageTitle = tab === 'calendar'
    ? 'Calendário'
    : tab === 'bases'
      ? 'Regras de bases'
      : tab === 'catalogs'
        ? 'Cadastros'
        : tab === 'overview'
          ? 'Visão geral'
        : `Disparos de ${channelName(activeChannel)}`;
  const userInitials = (session.name || session.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');
  const readinessChecks = dispatchReadinessChecks({
    ...editingDispatch,
    responsible: sessionResponsible || editingDispatch.responsible
  });
  const readinessCompleted = readinessChecks.filter(item => item.done).length;
  const currentMissingReadyFields = missingReadyDispatchFields({
    ...editingDispatch,
    responsible: sessionResponsible || editingDispatch.responsible
  });
  const dispatchFieldErrorSet = new Set(dispatchFieldErrors.filter(field => currentMissingReadyFields.includes(field)));
  const fieldError = (field: string, message: string) =>
    dispatchFieldErrorSet.has(field) ? <small className="fieldError">{message}</small> : null;
  const suggestionHint = (field: string, message: string) =>
    suggestedFields.includes(field) ? <small className="fieldHint">{message}</small> : null;
  const activeFilterChips = [
    filters.q ? { key: 'q' as FilterKey, label: `Busca: ${filters.q}`, value: '' } : null,
    filters.campaign ? { key: 'campaign' as FilterKey, label: `Campanha: ${filters.campaign}`, value: '' } : null,
    filters.audience ? { key: 'audience' as FilterKey, label: `Público: ${filters.audience}`, value: '' } : null,
    filters.status ? { key: 'status' as FilterKey, label: `Status: ${filters.status}`, value: '' } : null,
    filters.base ? { key: 'base' as FilterKey, label: `Base: ${state.bases.find(base => base.id === filters.base)?.mainBase || filters.base}`, value: '' } : null,
    filters.responsible ? { key: 'responsible' as FilterKey, label: `Responsável: ${filters.responsible}`, value: '' } : null,
    filters.validation ? { key: 'validation' as FilterKey, label: `Validação: ${filters.validation}`, value: '' } : null,
    filters.start ? { key: 'start' as FilterKey, label: `Data inicial: ${fmtDate(filters.start)}`, value: '' } : null,
    filters.end ? { key: 'end' as FilterKey, label: `Data final: ${fmtDate(filters.end)}`, value: '' } : null,
    filters.pending ? { key: 'pending' as FilterKey, label: 'Pendentes', value: false } : null,
    filters.sent ? { key: 'sent' as FilterKey, label: 'Enviados', value: false } : null,
    filters.alert ? { key: 'alert' as FilterKey, label: 'Com alerta', value: false } : null,
    filters.overlap ? { key: 'overlap' as FilterKey, label: 'Com sobreposição', value: false } : null,
    filters.missingBase ? { key: 'missingBase' as FilterKey, label: 'Sem base', value: false } : null,
    filters.staleBase ? { key: 'staleBase' as FilterKey, label: 'Base desatualizada', value: false } : null,
    filters.readyOnly ? { key: 'readyOnly' as FilterKey, label: 'Pronto/enviado', value: false } : null
  ].filter(Boolean) as Array<{ key: FilterKey; label: string; value: string | boolean }>;

  return (
    <div className="appShell">
      {sidebarOpen && <button className="sidebarScrim" aria-label="Fechar menu" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebarBrand">
          <img className="sidebarBrandLogo" src="/unigran-logo.png" alt="UNIGRAN" />
        </div>
        <nav className="sidebarNav" aria-label="Navegação principal">
          <button aria-pressed={tab === 'overview'} className={tab === 'overview' ? 'active' : ''} onClick={() => navigate('overview')}><span aria-hidden="true">⌂</span>Visão geral</button>
          <span className="sidebarNavLabel">DISPAROS</span>
          <button aria-pressed={tab === 'email'} className={tab === 'email' ? 'active' : ''} onClick={() => navigate('email')}><span aria-hidden="true">✉</span>E-mail</button>
          <button aria-pressed={tab === 'whatsapp'} className={tab === 'whatsapp' ? 'active' : ''} onClick={() => navigate('whatsapp')}><span aria-hidden="true">◉</span>WhatsApp</button>
          <button aria-pressed={tab === 'html_email'} className={tab === 'html_email' ? 'active' : ''} onClick={() => navigate('html_email')}><span aria-hidden="true">◇</span>E-mail HTML</button>
          <span className="sidebarNavLabel">ORGANIZAÇÃO</span>
          <button aria-pressed={tab === 'calendar'} className={tab === 'calendar' ? 'active' : ''} onClick={() => navigate('calendar')}><span aria-hidden="true">▦</span>Calendário</button>
          <button aria-pressed={tab === 'bases'} className={tab === 'bases' ? 'active' : ''} onClick={() => navigate('bases')}><span aria-hidden="true">◎</span>Regras de bases</button>
          <button aria-pressed={tab === 'catalogs'} className={tab === 'catalogs' ? 'active' : ''} onClick={() => navigate('catalogs')}><span aria-hidden="true">▤</span>Cadastros</button>
        </nav>
        <div className="sidebarUser">
          <span className="sidebarAvatar">{userInitials}</span>
          <div><strong>{session.name || 'Usuário'}</strong><span>{session.email}</span></div>
        </div>
      </aside>

      <main className="mainWorkspace">
        <header className="topbar">
          <div className="topbarTitle">
            <button className="mobileMenu" type="button" aria-label="Abrir menu" onClick={() => setSidebarOpen(true)}>☰</button>
            <div>
            <p>Marketing &amp; Relacionamento</p>
            <h1>{pageTitle}</h1>
            </div>
          </div>
          <div className="topbarActions">
            {(tab === 'email' || tab === 'whatsapp' || tab === 'html_email') && (
              <button className="btn primary topbarNew" onClick={() => openDispatch()}>＋ Novo disparo</button>
            )}
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
                requestDiscardOrRun(() => {
                  closeModal();
                  refreshState();
                });
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

        <div className="app">

      {feedback && <div className={`feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</div>}

      {tab === 'overview' && (
        <OverviewDashboard
          dispatches={state.dispatches}
          bases={state.bases}
          userName={(session.name || session.email.split('@')[0]).split(' ')[0]}
          onNavigate={navigate}
          onNew={() => openDispatch()}
          onView={openDispatchDetails}
        />
      )}

      {(tab === 'email' || tab === 'whatsapp' || tab === 'html_email') && (
        <>
          <div className="channelSegmented" aria-label="Canal de disparo">
            <button className={tab === 'email' ? 'active' : ''} onClick={() => navigate('email')}>E-mail <span>{state.dispatches.filter(item => (item.channel || 'email') === 'email').length}</span></button>
            <button className={tab === 'whatsapp' ? 'active' : ''} onClick={() => navigate('whatsapp')}>WhatsApp <span>{state.dispatches.filter(item => item.channel === 'whatsapp').length}</span></button>
            <button className={tab === 'html_email' ? 'active' : ''} onClick={() => navigate('html_email')}>HTML <span>{state.dispatches.filter(item => item.channel === 'html_email').length}</span></button>
          </div>
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
              <input className="quickSearch" placeholder="Buscar..." value={filters.q} onChange={event => updateFilter('q', event.target.value)} />
              <select className="quickFilter" value="" onChange={event => setPeriodPreset(event.target.value)}>
                <option value="">Período</option>
                <option value="7">Próximos 7 dias</option>
                <option value="15">Próximos 15 dias</option>
                <option value="30">Próximos 30 dias</option>
              </select>
              <Select value={filters.status} values={STATUS} placeholder="Status" onChange={value => updateFilter('status', value)} />
              <button className="btn ghost small" aria-expanded={filtersExpanded} onClick={() => setFiltersExpanded(current => !current)}>☷ Mais filtros</button>
              <button className="btn ghost small" onClick={clearCurrentFilters}>Limpar filtros</button>
            </div>
            {activeFilterChips.length > 0 && (
              <div className="activeFilterChips" aria-label="Filtros ativos">
                {activeFilterChips.map(chip => (
                  <button type="button" key={`${chip.key}-${chip.label}`} onClick={() => updateFilter(chip.key, chip.value)}>
                    {chip.label} <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            <div className={`filterBoard ${filtersExpanded ? 'expanded' : ''}`}>
              <div className="filterGroup searchGroup">
                <span>Período avançado</span>
                <div className="filterRow dateRow">
                  <input type="date" value={filters.start} onChange={event => updateFilter('start', event.target.value)} />
                  <input type="date" value={filters.end} onChange={event => updateFilter('end', event.target.value)} />
                </div>
              </div>
              <div className="filterGroup">
                <span>Classificação</span>
                <div className="filterRow selectRow">
                  <Select value={filters.campaign} values={campaigns} placeholder="Campanha" onChange={value => updateFilter('campaign', value)} />
                  <Select value={filters.audience} values={audiences} placeholder="Público" onChange={value => updateFilter('audience', value)} />
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
              onDuplicate={duplicateDispatch}
              onSyncCalendar={sendDispatchToCalendar}
              onRemoveCalendar={dispatch => setCalendarDeleteTarget(dispatch)}
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
            onCreate={openDispatchForDate}
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
        <div className="modalBackdrop" onMouseDown={requestModalClose}>
          <form className="modal dispatchFormModal" onSubmit={submitDispatch} onMouseDown={event => event.stopPropagation()}>
            <ModalHead title={editingDispatchMode === 'edit' ? `Editar disparo de ${channelLabel}` : `Novo disparo de ${channelLabel}`} onClose={requestModalClose} />
            <div className="dispatchFormLayout">
            <div className="dispatchFormContent">
            <div className="channelSelector">
              <button type="button" className={editingDispatch.channel === 'email' ? 'active' : ''} onClick={() => changeEditingDispatchChannel('email')}>✉ E-mail</button>
              <button type="button" className={editingDispatch.channel === 'whatsapp' ? 'active' : ''} onClick={() => changeEditingDispatchChannel('whatsapp')}>◉ WhatsApp</button>
              <button type="button" className={editingDispatch.channel === 'html_email' ? 'active' : ''} onClick={() => changeEditingDispatchChannel('html_email')}>◇ E-mail HTML</button>
            </div>
            <div className="modalGrid">
              <Field label="Data de disparo">
                <BrazilianDatePicker
                  value={editingDispatch.date}
                  onChange={value => setEditingDispatch({ ...editingDispatch, date: value })}
                />
                {fieldError('data', 'Informe a data antes de marcar como pronto.')}
              </Field>
              <Field label="Hora do disparo">
                <TwentyFourHourPicker
                  value={editingDispatch.time}
                  onChange={value => setEditingDispatch({ ...editingDispatch, time: value })}
                />
                {fieldError('horario', 'Informe o horário antes de marcar como pronto.')}
              </Field>
              <Field label="Nome do template"><input value={editingDispatch.templateName} onChange={event => setEditingDispatch({ ...editingDispatch, templateName: event.target.value })} />{fieldError('template', 'Informe o template antes de marcar como pronto.')}</Field>
              <Field label="Integração"><Select value={editingDispatch.chip} values={CHIP_OPTIONS} placeholder="Selecione" onChange={value => setEditingDispatch({ ...editingDispatch, chip: value as DispatchChip })} /></Field>
              <Field label="Campanha">
                <SelectWithCreate
                  value={editingDispatch.campaign}
                  values={campaigns}
                  placeholder="Selecione"
                  createLabel="Adicionar campanha"
                  onChange={updateEditingCampaign}
                  onCreate={async value => {
                    await addCatalogItem('campaigns', value);
                    setEditingDispatch(current => ({ ...current, campaign: value.trim() }));
                  }}
                />
                {suggestionHint('campanha', 'Campanha sugerida pela base selecionada.')}
                {fieldError('campanha', 'Informe a campanha antes de marcar como pronto.')}
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
                {fieldError('publico', 'Informe o público antes de marcar como pronto.')}
              </Field>
              <Field label="Status"><Select value={editingDispatch.status} values={editingDispatch.id ? STATUS : DISPATCH_FORM_STATUS} showPlaceholder={false} onChange={value => setEditingDispatchStatus(value as DispatchStatus)} /></Field>
              <Field label="Base"><Select value={editingDispatch.baseId} values={state.bases.map(base => base.id)} labels={new Map(state.bases.map(base => [base.id, `${base.campaign} - ${base.mainBase}`]))} placeholder="Selecione" onChange={updateEditingBase} />{suggestionHint('base', 'Base sugerida pela campanha selecionada.')}{fieldError('base', 'Selecione uma base antes de continuar.')}</Field>
              <Field label="Responsável">
                {sessionResponsible ? (
                  <input readOnly value={sessionResponsible} />
                ) : (
                  <SelectWithCreate
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
                {fieldError('responsavel', 'Informe o responsável antes de marcar como pronto.')}
              </Field>
              <Field label="Assunto" wide><input value={editingDispatch.subject} onChange={event => setEditingDispatch({ ...editingDispatch, subject: event.target.value })} />{fieldError('assunto', 'Informe o assunto antes de marcar como pronto.')}</Field>
              {editingDispatch.channel !== 'html_email' && (
                <Field label={editingDispatch.channel === 'whatsapp' ? 'Mensagem' : 'Conteúdo do e-mail (corpo)'} wide asGroup>
                  <RichTextEditor
                    value={editingDispatch.body}
                    onChange={value => setEditingDispatch({ ...editingDispatch, body: value })}
                  />
                  {fieldError(editingDispatch.channel === 'whatsapp' ? 'mensagem' : 'conteudo', editingDispatch.channel === 'whatsapp' ? 'Informe a mensagem antes de marcar como pronto.' : 'Informe o conteúdo antes de marcar como pronto.')}
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
                  {fieldError('conteudo HTML', 'Informe o conteúdo HTML antes de marcar como pronto.')}
                </Field>
              )}
            </div>
            </div>
            <aside className="readinessPanel">
              <div className="readinessTop"><span>Prontidão</span><strong>{readinessCompleted} de {readinessChecks.length}</strong></div>
              <div className="readinessProgress"><i style={{ width: `${(readinessCompleted / readinessChecks.length) * 100}%` }} /></div>
              <ul>
                {readinessChecks.map(check => <li className={check.done ? 'done' : 'pending'} key={check.key}><span>{check.done ? '✓' : '!'}</span>{check.label}</li>)}
              </ul>
              {readinessCompleted < readinessChecks.length && <div className="readinessAlert"><strong>Complete os itens pendentes</strong><p>Revise os campos antes de marcar o disparo como pronto.</p></div>}
              <button type="button" className="readinessAction" disabled={readinessCompleted < readinessChecks.length} onClick={() => setEditingDispatchStatus('Pronto para disparo')}>✓ Marcar como pronto</button>
            </aside>
            </div>
            <ModalFoot saving={saving} onClose={requestModalClose} />
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
                disabled={viewingDispatch.status !== 'Pronto para disparo'}
              >
                Sincronizar Google Calendar
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCalendarDeleteTarget(viewingDispatch)}
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
          onMouseDown={() => setCalendarDeleteTarget(null)}
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
                onClick={() => setCalendarDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn dangerStrong calendarDeleteButton"
                onClick={() => removeDispatchFromCalendar(calendarDeleteTarget)}
              >
                Sim, remover evento
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingDiscardAction && (
        <ConfirmDialog
          title="Descartar alterações?"
          text="Existem alterações que ainda não foram salvas neste disparo."
          safeLabel="Continuar editando"
          confirmLabel="Descartar alterações"
          onSafe={continueEditing}
          onConfirm={discardChanges}
        />
      )}
        </div>
      </main>
    </div>
  );
}
