const BASE = '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// WHY: parsedRequest validates the response through a parse function,
// catching shape mismatches at runtime instead of trusting type assertions.
async function parsedRequest<T>(path: string, parse: (raw: unknown) => T, init?: RequestInit): Promise<T> {
  const raw: unknown = await request<unknown>(path, init);
  return parse(raw);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  // WHY: Validated variants — use when silent shape mismatch is unacceptable.
  // The parse function validates the raw response and throws on wrong shape.
  parsedGet: <T>(path: string, parse: (raw: unknown) => T) =>
    parsedRequest<T>(path, parse),
  parsedPost: <T>(path: string, body: unknown, parse: (raw: unknown) => T) =>
    parsedRequest<T>(path, parse, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  parsedPut: <T>(path: string, body: unknown, parse: (raw: unknown) => T) =>
    parsedRequest<T>(path, parse, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
};
