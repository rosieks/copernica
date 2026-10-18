import type { components } from './schema';

export type Schemas = components['schemas'];
export type Problem = Schemas['Problem'];

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem & Record<string, unknown>;

  constructor(status: number, problem: Problem & Record<string, unknown>) {
    super(problem.title ?? `Request failed with status ${status}`);
    this.status = status;
    this.problem = problem;
  }

  /** Problem type suffix, e.g. `edit-conflict` for `urn:copernica:problem:edit-conflict`. */
  get type(): string {
    return (this.problem.type ?? '').split(':').pop() ?? '';
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** The antiforgery token for state-changing requests made outside `api()` (e.g. uploads with progress). */
export function antiforgeryToken(): string | undefined {
  const token = readCookie('XSRF-TOKEN');
  return token ? decodeURIComponent(token) : undefined;
}

/** Fetch wrapper: JSON in/out, antiforgery header on state-changing requests, problem+json errors. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }

  if (!SAFE_METHODS.has(method)) {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers.set('X-XSRF-TOKEN', decodeURIComponent(token));
  }

  const response = await fetch(path, { ...init, method, headers, body, credentials: 'same-origin' });

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('Content-Type') ?? '';
  const payload: unknown = contentType.includes('json') ? await response.json() : await response.text();

  if (!response.ok) {
    const problem =
      typeof payload === 'object' && payload !== null
        ? (payload as Problem & Record<string, unknown>)
        : { title: String(payload || response.statusText), status: response.status };
    throw new ApiError(response.status, problem);
  }

  return payload as T;
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
