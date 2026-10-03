/**
 * Authenticated client for the trustlists Companion API (app.trustlists.org).
 *
 * Every account-based tool goes through `companionFetch`, which attaches the
 * stored Bearer token, refreshes it when it is about to expire (or when the
 * server says 401), and turns API error envelopes into readable messages.
 */

import { SERVER_VERSION } from '../version.js';
import {
  type StoredSession,
  clearSession,
  getAppBaseUrl,
  readSession,
  sessionFromTokens,
  writeSession,
} from '../auth/store.js';

const USER_AGENT = `trustlists-mcp/${SERVER_VERSION}`;
const DEFAULT_TIMEOUT_MS = 30_000;
/** Refresh proactively when less than this remains on the access token. */
const REFRESH_SKEW_MS = 60_000;

export class CompanionApiError extends Error {
  status: number;
  code: string | null;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CompanionApiError';
    this.status = status;
    this.body = body;
    this.code = typeof body.code === 'string' ? body.code : null;
  }
}

export class NotSignedInError extends Error {
  constructor(message = 'Not signed in. Run trustlists_login first.') {
    super(message);
    this.name = 'NotSignedInError';
  }
}

export function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    'X-Trustlists-Source': 'mcp',
    'X-Trustlists-Version': SERVER_VERSION,
    ...extra,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function errorMessage(body: Record<string, unknown>, status: number): string {
  const direct = typeof body.error === 'string' ? body.error : '';
  const message = typeof body.message === 'string' ? body.message : '';
  return direct || message || `Request failed with HTTP ${status}`;
}

/** Unauthenticated call (device auth start/poll, refresh). */
export async function publicPost(
  pathname: string,
  body: unknown,
  options: { timeoutMs?: number } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetchWithTimeout(`${getAppBaseUrl()}${pathname}`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
  }, options.timeoutMs);
  return { status: response.status, body: await parseJson(response) };
}

let refreshInFlight: Promise<StoredSession> | null = null;

async function refreshSession(session: StoredSession): Promise<StoredSession> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { status, body } = await publicPost('/api/companion/auth/refresh', {
        refreshToken: session.refreshToken,
      });
      if (status !== 200 || typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string') {
        // The refresh token is dead; make the user sign in again rather than
        // looping on a token that will never work.
        await clearSession();
        throw new NotSignedInError('Your trustlists session expired. Run trustlists_login to sign in again.');
      }
      const next = sessionFromTokens({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        expiresIn: typeof body.expiresIn === 'number' ? body.expiresIn : 900,
        user: session.user,
      }, session.baseUrl);
      await writeSession(next);
      return next;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function requireSession(): Promise<StoredSession> {
  const session = await readSession();
  if (!session) throw new NotSignedInError();
  if (session.expiresAt - Date.now() < REFRESH_SKEW_MS) {
    return refreshSession(session);
  }
  return session;
}

export interface CompanionFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Return the error envelope for these statuses instead of throwing. */
  allowStatuses?: number[];
}

export interface CompanionResponse<T = Record<string, unknown>> {
  status: number;
  body: T & Record<string, unknown>;
}

export async function companionFetch<T = Record<string, unknown>>(
  pathname: string,
  options: CompanionFetchOptions = {},
): Promise<CompanionResponse<T>> {
  let session = await requireSession();
  const allow = new Set(options.allowStatuses || []);

  const doFetch = async (token: string) => fetchWithTimeout(`${session.baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: baseHeaders({
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    }),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }, options.timeoutMs);

  let response = await doFetch(session.accessToken);
  if (response.status === 401) {
    session = await refreshSession(session);
    response = await doFetch(session.accessToken);
  }

  const body = await parseJson(response);
  if (response.ok || allow.has(response.status)) {
    return { status: response.status, body: body as T & Record<string, unknown> };
  }
  if (response.status === 401) {
    await clearSession();
    throw new NotSignedInError('trustlists rejected the stored session. Run trustlists_login to sign in again.');
  }
  throw new CompanionApiError(errorMessage(body, response.status), response.status, body);
}

/** Raw PUT of bytes to a signed storage URL (no auth header). */
export async function putBytes(url: string, bytes: Uint8Array, contentType: string, timeoutMs = 120_000): Promise<void> {
  const response = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'User-Agent': USER_AGENT },
    body: bytes,
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(`Upload failed (HTTP ${response.status})`);
  }
}

export function appUrl(pathname: string): string {
  return `${getAppBaseUrl()}${pathname}`;
}
