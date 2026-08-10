import type { AppState } from './types';

type DeletedCatalog = {
  key: 'campaigns' | 'audiences' | 'responsibles';
  value: string;
};

export type AuthSession = {
  accessToken: string;
  email: string;
  name: string;
  role: string;
};

function authHeaders(accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function readError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.error || data.msg || text;
  } catch {
    return text;
  }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function getCurrentUser(accessToken: string): Promise<AuthSession> {
  const response = await fetch('/api/auth/me', {
    headers: authHeaders(accessToken)
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function loadState(accessToken: string): Promise<AppState> {
  const response = await fetch('/api/state', {
    headers: authHeaders(accessToken)
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function saveState(state: AppState, accessToken: string, deletedCatalog?: DeletedCatalog | DeletedCatalog[]): Promise<AppState> {
  const deletedCatalogs = deletedCatalog ? (Array.isArray(deletedCatalog) ? deletedCatalog : [deletedCatalog]) : [];
  const response = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({
      dispatches: state.dispatches,
      bases: state.bases,
      campaigns: state.campaigns,
      audiences: state.audiences,
      responsibles: state.responsibles,
      revision: state.revision,
      deletedCatalog,
      deletedCatalogs
    })
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function sendCalendarToN8n(dispatchId: string, accessToken: string, action: 'upsert' | 'delete' = 'upsert'): Promise<{ sent: number; eventId: string; revision: string; response: unknown }> {
  const response = await fetch('/api/integrations/n8n/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ dispatchId, action })
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
