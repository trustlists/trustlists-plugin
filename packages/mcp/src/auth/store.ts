/**
 * Credential store for account-based tools.
 *
 * On the stdio server, tokens live in ~/.trustlists/auth.json (0600). Override
 * the location with TRUSTLISTS_AUTH_FILE and the API host with
 * TRUSTLISTS_APP_URL (useful for local development).
 *
 * On the hosted endpoint, each MCP request carries its own OAuth access token.
 * runWithRequestSession scopes that token to the request so the account tools
 * read it instead of the file, and nothing is written to disk.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_APP_URL = 'https://app.trustlists.org';

export interface StoredUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface StoredSession {
  baseUrl: string;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when accessToken stops being accepted. */
  expiresAt: number;
  user: StoredUser;
  savedAt: string;
}

export function getAppBaseUrl(): string {
  const configured = String(process.env.TRUSTLISTS_APP_URL || '').trim().replace(/\/+$/, '');
  return configured || DEFAULT_APP_URL;
}

export function getAuthFilePath(): string {
  const configured = String(process.env.TRUSTLISTS_AUTH_FILE || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), '.trustlists', 'auth.json');
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.accessToken === 'string'
    && typeof v.refreshToken === 'string'
    && typeof v.expiresAt === 'number'
    && !!v.user && typeof (v.user as Record<string, unknown>).id === 'string';
}

const requestSession = new AsyncLocalStorage<StoredSession>();

/** Run fn with a session that belongs to one hosted MCP request. */
export function runWithRequestSession<T>(session: StoredSession, fn: () => T): T {
  return requestSession.run(session, fn);
}

export function getRequestSession(): StoredSession | null {
  return requestSession.getStore() ?? null;
}

export async function readSession(): Promise<StoredSession | null> {
  const scoped = requestSession.getStore();
  if (scoped) return scoped;
  try {
    const raw = await fs.readFile(getAuthFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredSession(parsed)) return null;
    // A session saved against another host is not valid for this one.
    if (parsed.baseUrl && parsed.baseUrl !== getAppBaseUrl()) return null;
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    // Corrupt file: treat as signed out rather than crashing every tool.
    return null;
  }
}

export async function writeSession(session: StoredSession): Promise<void> {
  if (requestSession.getStore()) return;
  const file = getAuthFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
  // mkdir's mode is ignored when the directory already exists.
  await fs.chmod(path.dirname(file), 0o700).catch(() => undefined);
  await fs.chmod(file, 0o600).catch(() => undefined);
}

export async function clearSession(): Promise<boolean> {
  if (requestSession.getStore()) return false;
  try {
    await fs.unlink(getAuthFilePath());
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
    throw error;
  }
}

export function sessionFromTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: StoredUser;
}, baseUrl = getAppBaseUrl()): StoredSession {
  const expiresIn = Number(tokens.expiresIn || 900);
  return {
    baseUrl,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    user: {
      id: tokens.user.id,
      email: tokens.user.email,
      displayName: tokens.user.displayName ?? null,
    },
    savedAt: new Date().toISOString(),
  };
}
