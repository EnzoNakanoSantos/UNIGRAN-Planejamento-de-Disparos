import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toN8nCalendarEvent } from './calendar-event.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const INDEX_FILE = path.join(ROOT, 'index.html');
const MAX_BODY_SIZE = 40_000_000;

loadEnvFile(path.join(ROOT, '.env'));

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_READY = Boolean(SUPABASE_URL && SUPABASE_KEY);
const N8N_CALENDAR_WEBHOOK_URL = (process.env.N8N_CALENDAR_WEBHOOK_URL || '').trim();
const N8N_CALENDAR_WEBHOOK_SECRET = (process.env.N8N_CALENDAR_WEBHOOK_SECRET || '').trim();
const N8N_CALENDAR_WEBHOOK_SECRET_HEADER = (process.env.N8N_CALENDAR_WEBHOOK_SECRET_HEADER || 'X-Webhook-Secret').trim();
const N8N_CALENDAR_WEBHOOK_TIMEOUT_MS = Number(process.env.N8N_CALENDAR_WEBHOOK_TIMEOUT_MS || 15000);

const TABLES = {
  allowedUsers: 'allowed_users',
  dispatches: 'dispatches',
  bases: 'base_rules',
  campaigns: 'campaign_options',
  audiences: 'audience_options',
  responsibles: 'responsible_options'
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...parts] = trimmed.split('=');
    if (process.env[key]) continue;
    process.env[key] = parts.join('=').replace(/^["']|["']$/g, '');
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        tooLarge = true;
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('JSON inválido ou incompleto na requisição.'));
      }
    });
    req.on('error', reject);
  });
}

function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function safePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function n8nWebhookHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (N8N_CALENDAR_WEBHOOK_SECRET) {
    headers[N8N_CALENDAR_WEBHOOK_SECRET_HEADER || 'X-Webhook-Secret'] = N8N_CALENDAR_WEBHOOK_SECRET;
  }
  return headers;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), safePositiveInteger(timeoutMs, 15000));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    return {
      response,
      text,
      data: safeJsonParse(text)
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('n8n: tempo limite excedido ao chamar o webhook.');
    }
    throw new Error('n8n: nao foi possivel chamar o webhook configurado.');
  } finally {
    clearTimeout(timeout);
  }
}

function safeWebhookErrorMessage(data) {
  const message = data?.error || data?.message || data?.errorMessage || '';
  return String(message || 'Falha ao enviar webhook.').slice(0, 300);
}

function friendlySupabaseError(status, text) {
  const data = safeJsonParse(text);
  const message = data?.message || data?.msg || data?.error_description || data?.error || text || 'Erro desconhecido do Supabase.';
  const hint = data?.hint ? ` Dica: ${data.hint}` : '';
  const code = data?.code || data?.error_code || '';

  if (/schema cache|Could not find/i.test(message)) {
    return `Supabase ${status}: campo ou tabela ausente no schema. Rode a query de correção em database/fix-common-errors.sql. Detalhe: ${message}`;
  }
  if (/row-level security|permission denied|42501/i.test(`${code} ${message}`)) {
    return `Supabase ${status}: permissão/RLS bloqueando a operação. Rode a query de permissões em database/fix-common-errors.sql.${hint}`;
  }
  if (/duplicate key value|23505/i.test(`${code} ${message}`)) {
    return `Supabase ${status}: já existe um cadastro com esse nome. Use outro nome ou edite o cadastro existente.`;
  }
  if (/violates check constraint|23514/i.test(`${code} ${message}`)) {
    return `Supabase ${status}: algum valor não é aceito pela regra do banco. Rode database/fix-common-errors.sql e confira status/canal/integração. Detalhe: ${message}`;
  }
  if (/null value|23502/i.test(`${code} ${message}`)) {
    return `Supabase ${status}: existe uma coluna obrigatória antiga no banco. Rode database/fix-common-errors.sql. Detalhe: ${message}`;
  }

  return `Supabase ${status}: ${message}${hint}`;
}

function supabaseHeaders(extra = {}) {
  if (!SUPABASE_READY) {
    throw new Error('Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no .env.');
  }
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function authHeaders(extra = {}, accessToken = '') {
  if (!SUPABASE_READY) {
    throw new Error('Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no .env.');
  }
  return {
    apikey: SUPABASE_KEY,
    Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(table, query = '', options = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}${query}`;
  const response = await fetch(url, {
    ...options,
    headers: supabaseHeaders({
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.headers || {})
    })
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(friendlySupabaseError(response.status, message));
  }
  const text = await response.text();
  if (!text) return null;
  const data = safeJsonParse(text);
  if (data === null) throw new Error('Resposta inválida do Supabase.');
  return data;
}

async function supabaseAuthRequest(pathname, options = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${pathname.replace(/^\//, '')}`;
  const response = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}, options.accessToken || '')
  });
  const text = await response.text();
  const data = safeJsonParse(text);
  if (!response.ok) {
    throw new Error(data?.error_description || data?.msg || data?.error || text || 'Falha na autenticação');
  }
  return data;
}

async function signIn(email, password) {
  const data = await supabaseAuthRequest('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (!data?.access_token) throw new Error('Supabase não retornou sessão de login.');
  return authorizeSession(data.access_token);
}

async function authorizeSession(accessToken) {
  if (!accessToken) throw new Error('Sessão não informada');
  const user = await supabaseAuthRequest('/user', {
    method: 'GET',
    accessToken
  });
  const email = String(user.email || '').trim().toLowerCase();
  if (!email) throw new Error('Usuário sem e-mail no Supabase Auth');

  const allowed = await supabaseRequest(
    TABLES.allowedUsers,
    `?select=email,name,role,active&email=eq.${encodeURIComponent(email)}&active=eq.true&limit=1`,
    { method: 'GET', accessToken }
  );

  if (!allowed?.length) {
    throw new Error('Acesso não autorizado para este e-mail.');
  }

  return {
    accessToken,
    email,
    name: allowed[0].name || '',
    role: allowed[0].role || 'user'
  };
}

async function requireAuthorizedUser(req) {
  return authorizeSession(bearerToken(req));
}

async function optionalSupabaseList(table, query = '', accessToken = '') {
  try {
    return await supabaseRequest(table, query, { accessToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('PGRST') || message.includes('does not exist') || message.includes('schema cache')) {
      return [];
    }
    throw error;
  }
}

function toDbDispatch(item) {
  return {
    id: item.id,
    channel: item.channel || 'email',
    dispatch_date: item.date,
    dispatch_time: item.time || null,
    template_name: item.templateName || '',
    chip: item.chip || '',
    html_content: item.htmlContent || '',
    subject: item.subject || '',
    body: item.body || '',
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    campaign: item.campaign,
    audience: item.audience,
    description: item.description,
    status: item.status,
    base_rule_id: item.baseId || null,
    responsible: item.responsible,
    google_calendar_event_id: item.googleCalendarEventId || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function fromDbDispatch(item) {
  return {
    id: item.id,
    channel: item.channel || 'email',
    date: item.dispatch_date,
    time: item.dispatch_time || '',
    templateName: item.template_name || '',
    chip: item.chip || '',
    htmlContent: item.html_content || '',
    subject: item.subject || '',
    body: item.body || '',
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    campaign: item.campaign,
    audience: item.audience,
    description: item.description,
    status: item.status,
    baseId: item.base_rule_id || '',
    responsible: item.responsible,
    googleCalendarEventId: item.google_calendar_event_id || '',
    createdAt: item.created_at,
    updatedAt: item.updated_at
  };
}

function toDbBase(item) {
  return {
    id: item.id,
    campaign: item.campaign,
    main_base: item.mainBase,
    excluded_bases: item.excludedBases,
    expected_action: item.expectedAction,
    last_updated: item.lastUpdated || null,
    responsible: item.responsible,
    notes: item.notes,
    spreadsheet_attachment: item.spreadsheetAttachment || null
  };
}

function fromDbBase(item) {
  return {
    id: item.id,
    campaign: item.campaign,
    mainBase: item.main_base,
    excludedBases: item.excluded_bases || '',
    expectedAction: item.expected_action,
    lastUpdated: item.last_updated || '',
    responsible: item.responsible,
    notes: item.notes || '',
    spreadsheetAttachment: item.spreadsheet_attachment || null
  };
}

function toDbOption(name) {
  const value = String(name || '').trim();
  return {
    id: value,
    name: value,
    active: true
  };
}

function fromDbOption(item) {
  return item.name;
}

function optionDates(items) {
  return Object.fromEntries(items.map(item => [
    item.name,
    {
      createdAt: item.created_at || '',
      updatedAt: item.updated_at || item.created_at || ''
    }
  ]));
}

function revisionFromRows(groups) {
  const rows = Object.entries(groups).flatMap(([table, items]) =>
    items.map(item => ({
      table,
      id: item.id || item.email || item.name || '',
      updatedAt: item.updated_at || '',
      createdAt: item.created_at || '',
      status: item.status || '',
      name: item.name || ''
    }))
  );
  rows.sort((a, b) => `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function loadState(accessToken) {
  const [dispatches, bases, campaigns, audiences, responsibles] = await Promise.all([
    supabaseRequest(TABLES.dispatches, '?select=*&order=dispatch_date.asc', { accessToken }),
    supabaseRequest(TABLES.bases, '?select=*&order=campaign.asc', { accessToken }),
    optionalSupabaseList(TABLES.campaigns, '?select=*&active=eq.true&order=name.asc', accessToken),
    optionalSupabaseList(TABLES.audiences, '?select=*&active=eq.true&order=name.asc', accessToken),
    optionalSupabaseList(TABLES.responsibles, '?select=*&active=eq.true&order=name.asc', accessToken)
  ]);
  return {
    dispatches: dispatches.map(fromDbDispatch),
    bases: bases.map(fromDbBase),
    campaigns: campaigns.map(fromDbOption),
    audiences: audiences.map(fromDbOption),
    responsibles: responsibles.map(fromDbOption),
    revision: revisionFromRows({ dispatches, bases, campaigns, audiences, responsibles }),
    catalogDates: {
      campaigns: optionDates(campaigns),
      audiences: optionDates(audiences),
      responsibles: optionDates(responsibles)
    }
  };
}

async function loadCalendarContext(dispatchId, accessToken) {
  const encodedDispatchId = encodeURIComponent(dispatchId);
  const [selectedDispatches, dispatches, bases, campaigns, audiences, responsibles] = await Promise.all([
    supabaseRequest(TABLES.dispatches, `?select=*&id=eq.${encodedDispatchId}&limit=1`, { accessToken }),
    supabaseRequest(TABLES.dispatches, '?select=id,updated_at,created_at,status', { accessToken }),
    supabaseRequest(TABLES.bases, '?select=id,main_base,updated_at,created_at', { accessToken }),
    optionalSupabaseList(TABLES.campaigns, '?select=id,name,updated_at,created_at&active=eq.true', accessToken),
    optionalSupabaseList(TABLES.audiences, '?select=id,name,updated_at,created_at&active=eq.true', accessToken),
    optionalSupabaseList(TABLES.responsibles, '?select=id,name,updated_at,created_at&active=eq.true', accessToken)
  ]);

  const dispatchRow = selectedDispatches?.[0];
  const baseRow = dispatchRow?.base_rule_id
    ? bases.find(item => item.id === dispatchRow.base_rule_id)
    : undefined;

  return {
    dispatchRow,
    baseRow,
    revisionRows: { dispatches, bases, campaigns, audiences, responsibles }
  };
}

function revisionAfterDispatchUpdate(groups, updatedDispatch) {
  return revisionFromRows({
    ...groups,
    dispatches: groups.dispatches.map(item => item.id === updatedDispatch.id ? updatedDispatch : item)
  });
}

async function sendCalendarWebhook(body, user) {
  if (!N8N_CALENDAR_WEBHOOK_URL) {
    throw new Error('Webhook do n8n nao configurado. Defina N8N_CALENDAR_WEBHOOK_URL no .env.');
  }

  const dispatchId = String(body.dispatchId || '').trim();
  const action = String(body.action || 'upsert').trim().toLowerCase();
  if (!dispatchId) throw new Error('Informe o disparo que sera enviado ao Google Calendar.');
  if (!['upsert', 'delete'].includes(action)) throw new Error('Ação de Google Calendar inválida.');

  const startedAt = Date.now();
  const context = await loadCalendarContext(dispatchId, user.accessToken);
  const contextLoadedAt = Date.now();
  const dispatch = context.dispatchRow ? fromDbDispatch(context.dispatchRow) : undefined;
  if (!dispatch) throw new Error('Disparo nao encontrado.');
  if (action === 'upsert' && dispatch.status !== 'Pronto para disparo') {
    throw new Error('Apenas disparos com status Pronto para disparo podem ser enviados ao Google Calendar.');
  }
  const event = toN8nCalendarEvent(dispatch, context.baseRow ? fromDbBase(context.baseRow) : undefined);

  const payload = {
    source: 'unigran-email-planner',
    action,
    calendarEventId: event.googleEventId,
    dispatchId: dispatch.id,
    requestedBy: {
      email: user.email,
      name: user.name,
      role: user.role
    },
    count: 1,
    event,
    events: [event]
  };

  const { response, data } = await fetchJsonWithTimeout(N8N_CALENDAR_WEBHOOK_URL, {
    method: 'POST',
    headers: n8nWebhookHeaders(),
    body: JSON.stringify(payload)
  }, N8N_CALENDAR_WEBHOOK_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`n8n ${response.status}: ${safeWebhookErrorMessage(data)}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('n8n: resposta invalida do webhook. Configure o workflow para responder JSON.');
  }

  const returnedEventId = String(data?.eventId || data?.googleEventId || '').trim();
  if (action === 'upsert' && !returnedEventId) {
    throw new Error('O n8n não retornou o ID real do evento criado/atualizado. Importe o workflow v4 com o nó Respond to Webhook.');
  }
  const webhookFinishedAt = Date.now();

  const nextEventId = action === 'delete' ? '' : returnedEventId;
  const updatedDispatches = await supabaseRequest(TABLES.dispatches, `?id=eq.${encodeURIComponent(dispatch.id)}&select=id,updated_at,created_at,status`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ google_calendar_event_id: nextEventId || null }),
    accessToken: user.accessToken
  });
  const updatedDispatch = updatedDispatches?.[0];
  if (!updatedDispatch) {
    throw new Error('Supabase nao confirmou a atualizacao do disparo apos sincronizar o calendario.');
  }
  const revision = revisionAfterDispatchUpdate(context.revisionRows, updatedDispatch);
  const finishedAt = Date.now();

  console.info('[calendar-sync]', {
    action,
    contextMs: contextLoadedAt - startedAt,
    webhookMs: webhookFinishedAt - contextLoadedAt,
    persistenceMs: finishedAt - webhookFinishedAt,
    totalMs: finishedAt - startedAt
  });

  return {
    sent: 1,
    eventId: nextEventId,
    revision,
    response: data
  };
}

async function clearTable(table, accessToken) {
  await supabaseRequest(table, '?id=not.is.null', {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
    accessToken
  });
}

async function upsertRows(table, rows, accessToken) {
  if (!rows.length) return;
  await supabaseRequest(table, '?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
    accessToken
  });
}

async function upsertOptionRows(table, rows, accessToken) {
  if (!rows.length) return;
  await supabaseRequest(table, '?on_conflict=name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
    accessToken
  });
}

function postgrestList(values) {
  return values
    .map(value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
}

async function deleteMissingRows(table, ids, accessToken) {
  if (!ids.length) {
    await clearTable(table, accessToken);
    return;
  }
  await supabaseRequest(table, `?id=not.in.(${encodeURIComponent(postgrestList(ids))})`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
    accessToken
  });
}

async function deleteCatalogRows(deletedCatalogs, accessToken) {
  const items = Array.isArray(deletedCatalogs) ? deletedCatalogs : [deletedCatalogs].filter(Boolean);
  for (const deletedCatalog of items) {
    if (!deletedCatalog || !TABLES[deletedCatalog.key] || !deletedCatalog.value) continue;
    await supabaseRequest(TABLES[deletedCatalog.key], `?id=eq.${encodeURIComponent(deletedCatalog.value)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
      accessToken
    });
  }
}

async function saveState(state, accessToken) {
  if (
    !Array.isArray(state.dispatches) ||
    !Array.isArray(state.bases) ||
    !Array.isArray(state.campaigns) ||
    !Array.isArray(state.audiences) ||
    !Array.isArray(state.responsibles)
  ) {
    throw new Error('Estado invalido');
  }

  const current = await loadState(accessToken);
  if (state.revision && current.revision && state.revision !== current.revision) {
    throw new Error('Os dados foram alterados em outro navegador. Recarregue antes de salvar para evitar sobrescrever alterações recentes.');
  }

  const bases = state.bases.map(toDbBase);
  const currentCalendarIds = new Map(
    current.dispatches.map(item => [item.id, item.googleCalendarEventId || ''])
  );
  const dispatches = state.dispatches.map(item => toDbDispatch({
    ...item,
    googleCalendarEventId: item.googleCalendarEventId || currentCalendarIds.get(item.id) || ''
  }));
  const campaigns = state.campaigns.map(toDbOption);
  const audiences = state.audiences.map(toDbOption);
  const responsibles = state.responsibles.map(toDbOption);

  await upsertRows(TABLES.bases, bases, accessToken);
  await upsertRows(TABLES.dispatches, dispatches, accessToken);
  await upsertOptionRows(TABLES.campaigns, campaigns, accessToken);
  await upsertOptionRows(TABLES.audiences, audiences, accessToken);
  await upsertOptionRows(TABLES.responsibles, responsibles, accessToken);

  await deleteMissingRows(TABLES.dispatches, dispatches.map(item => item.id), accessToken);
  await deleteMissingRows(TABLES.bases, bases.map(item => item.id), accessToken);
  await deleteCatalogRows(state.deletedCatalogs || state.deletedCatalog, accessToken);
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath);
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.sql': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function sendFile(req, res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: 'Arquivo nao encontrado' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Cache-Control': 'no-store'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(content);
  });
}

function serveApp(req, res, url) {
  const distPath = path.join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  if (fs.existsSync(distPath) && fs.statSync(distPath).isFile()) {
    sendFile(req, res, distPath);
    return;
  }
  if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    sendFile(req, res, path.join(DIST_DIR, 'index.html'));
    return;
  }
  sendFile(req, res, INDEX_FILE);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || !password) {
        sendJson(res, 400, { error: 'Informe e-mail e senha.' });
        return;
      }
      sendJson(res, 200, await signIn(email, password));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      sendJson(res, 200, await requireAuthorizedUser(req));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      const user = await requireAuthorizedUser(req);
      sendJson(res, 200, {
        ...(await loadState(user.accessToken)),
        database: 'supabase'
      });
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/api/state') {
      const user = await requireAuthorizedUser(req);
      const state = await readJsonBody(req);
      await saveState(state, user.accessToken);
      sendJson(res, 200, {
        ...(await loadState(user.accessToken)),
        database: 'supabase'
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/n8n/calendar') {
      const user = await requireAuthorizedUser(req);
      const body = await readJsonBody(req);
      sendJson(res, 200, await sendCalendarWebhook(body, user, req));
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveApp(req, res, url);
      return;
    }

    sendJson(res, 404, { error: 'Rota nao encontrada' });
  } catch (error) {
    const message = error.message || 'Erro interno';
    const status = /Sessão|autenticação|JWT|login|senha|autorizado|e-mail/i.test(message)
      ? 401
      : /JSON|Payload|Estado|alterados em outro navegador|Supabase 400|Supabase 409/i.test(message)
        ? 400
        : /RLS|permissão|permission|Supabase 401|Supabase 403/i.test(message)
          ? 403
          : 500;
    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Aplicacao rodando em http://0.0.0.0:${PORT}`);
  console.log(`Banco ativo: Supabase`);
});
