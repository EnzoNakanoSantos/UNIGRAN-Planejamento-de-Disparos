export function authHeaders(accessToken?: string) {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

export async function readError(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data.error || data.msg || text;
  } catch {
    return text;
  }
}
