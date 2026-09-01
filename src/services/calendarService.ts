import { authHeaders, readError } from './http';

export async function sendCalendarToN8n(dispatchId: string, accessToken: string, action: 'upsert' | 'delete' = 'upsert'): Promise<{ sent: number; eventId: string; revision: string; response: unknown }> {
  const response = await fetch('/api/integrations/n8n/calendar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(accessToken) },
    body: JSON.stringify({ dispatchId, action })
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
