import { authHeaders, readError } from './http';

export type AuthSession = {
  accessToken: string;
  email: string;
  name: string;
  role: string;
};

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
  const response = await fetch('/api/auth/me', { headers: authHeaders(accessToken) });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}
