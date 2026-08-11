import type { AppState, CatalogKey } from '../types';
import { authHeaders, readError } from './http';

type DeletedCatalog = { key: CatalogKey; value: string };

export async function loadState(accessToken: string): Promise<AppState> {
  const response = await fetch('/api/state', { headers: authHeaders(accessToken) });
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
