/**
 * Account tools: trustlists_login, trustlists_logout, trustlists_whoami.
 *
 * Login uses the OAuth device flow. The tool starts a grant, shows the user a
 * short code and URL, and polls until the user approves it in their browser.
 * Nothing about the user's browser session is shared with the MCP; the app
 * mints a dedicated session for this machine on approval.
 */

import { z } from 'zod';
import {
  CompanionApiError,
  NotSignedInError,
  appUrl,
  companionFetch,
  publicPost,
} from '../api/companion.js';
import {
  clearSession,
  getAuthFilePath,
  readSession,
  sessionFromTokens,
  writeSession,
} from '../auth/store.js';
import { SERVER_VERSION } from '../version.js';

const DEFAULT_WAIT_SECONDS = 90;
const MAX_WAIT_SECONDS = 240;

export const loginInputSchema = z.object({
  deviceCode: z.string().min(10).optional()
    .describe('Continue waiting on a login you already started (from a previous pending result).'),
  waitSeconds: z.number().int().min(0).max(MAX_WAIT_SECONDS).optional().default(DEFAULT_WAIT_SECONDS)
    .describe('How long to wait for approval before returning a pending result. 0 returns immediately.'),
  force: z.boolean().optional().default(false)
    .describe('Start a new login even if a session is already stored.'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export interface LoginToolResult {
  status: 'signed_in' | 'already_signed_in' | 'pending' | 'denied' | 'expired';
  user?: { id: string; email: string; displayName?: string | null };
  /** Present while pending so the caller can continue with trustlists_login({ deviceCode }). */
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  verificationUriComplete?: string;
  expiresInSeconds?: number;
  message: string;
  nextStep?: string;
}

type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let sleep: SleepFn = defaultSleep;

/** Test hook so login tests do not wait on the real poll interval. */
export function setLoginSleepForTests(fn: SleepFn | null): void {
  sleep = fn || defaultSleep;
}

interface StartedGrant {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

async function startGrant(): Promise<StartedGrant> {
  const { status, body } = await publicPost('/api/companion/auth/device/start', {
    clientName: 'trustlists MCP',
    clientVersion: SERVER_VERSION,
  });
  if (status !== 200 || typeof body.deviceCode !== 'string' || typeof body.userCode !== 'string') {
    const reason = typeof body.error === 'string' ? body.error : `HTTP ${status}`;
    throw new Error(`Could not start sign-in: ${reason}`);
  }
  return {
    deviceCode: body.deviceCode,
    userCode: body.userCode,
    verificationUri: String(body.verificationUri || appUrl('/device')),
    verificationUriComplete: String(body.verificationUriComplete || appUrl(`/device?code=${encodeURIComponent(body.userCode)}`)),
    expiresIn: Number(body.expiresIn || 600),
    interval: Number(body.interval || 5),
  };
}

type PollOutcome =
  | { kind: 'approved'; tokens: { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; email: string; displayName?: string | null } } }
  | { kind: 'pending' }
  | { kind: 'denied' }
  | { kind: 'expired' };

async function pollUntil(deviceCode: string, intervalSeconds: number, deadline: number): Promise<PollOutcome> {
  let interval = Math.max(1, intervalSeconds);
  for (;;) {
    const { status, body } = await publicPost('/api/companion/auth/device/poll', { deviceCode });
    if (status === 200 && typeof body.accessToken === 'string' && typeof body.refreshToken === 'string') {
      const user = (body.user || {}) as { id?: string; email?: string; displayName?: string | null };
      return {
        kind: 'approved',
        tokens: {
          accessToken: body.accessToken,
          refreshToken: body.refreshToken,
          expiresIn: Number(body.expiresIn || 900),
          user: { id: String(user.id || ''), email: String(user.email || ''), displayName: user.displayName ?? null },
        },
      };
    }
    const code = typeof body.error === 'string' ? body.error : '';
    if (code === 'access_denied') return { kind: 'denied' };
    if (code === 'expired_token' || code === 'invalid_grant') return { kind: 'expired' };
    if (code === 'slow_down' || status === 429) interval += 5;
    if (code !== 'authorization_pending' && code !== 'slow_down' && status !== 429) {
      const reason = typeof body.message === 'string' ? body.message : code || `HTTP ${status}`;
      throw new Error(`Sign-in failed: ${reason}`);
    }
    if (Date.now() + interval * 1000 > deadline) return { kind: 'pending' };
    await sleep(interval * 1000);
  }
}

export async function runLogin(input: LoginInput): Promise<LoginToolResult> {
  if (!input.force && !input.deviceCode) {
    const existing = await readSession();
    if (existing) {
      return {
        status: 'already_signed_in',
        user: existing.user,
        message: `Already signed in as ${existing.user.email}. Pass force: true to sign in as someone else.`,
      };
    }
  }

  let grant: StartedGrant | null = null;
  let deviceCode = input.deviceCode || '';
  let interval = 5;
  if (!deviceCode) {
    grant = await startGrant();
    deviceCode = grant.deviceCode;
    interval = grant.interval;
  }

  const pendingResult = (): LoginToolResult => ({
    status: 'pending',
    deviceCode,
    ...(grant ? {
      userCode: grant.userCode,
      verificationUri: grant.verificationUri,
      verificationUriComplete: grant.verificationUriComplete,
      expiresInSeconds: grant.expiresIn,
    } : {}),
    message: grant
      ? `Open ${grant.verificationUriComplete} and confirm code ${grant.userCode} to connect this MCP to your trustlists account.`
      : 'Still waiting for approval in the browser.',
    nextStep: `Tell the user to open the link and approve, then call trustlists_login({ deviceCode: "${deviceCode}" }) to finish.`,
  });

  if (input.waitSeconds === 0) return pendingResult();

  const deadline = Date.now() + input.waitSeconds * 1000;
  // Give the user a moment to open the link before the first poll.
  await sleep(Math.min(interval, 3) * 1000);
  const outcome = await pollUntil(deviceCode, interval, deadline);

  if (outcome.kind === 'approved') {
    const session = sessionFromTokens(outcome.tokens);
    await writeSession(session);
    return {
      status: 'signed_in',
      user: session.user,
      message: `Signed in as ${session.user.email}. Credentials saved to ${getAuthFilePath()}.`,
    };
  }
  if (outcome.kind === 'denied') {
    return { status: 'denied', message: 'The sign-in request was denied in the browser. Run trustlists_login again to retry.' };
  }
  if (outcome.kind === 'expired') {
    return { status: 'expired', message: 'The sign-in code expired before it was approved. Run trustlists_login again for a fresh code.' };
  }
  return pendingResult();
}

export const loginToolDefinition = {
  name: 'trustlists_login',
  description:
    'Sign in to a trustlists account so this MCP can run SOC 2 analyses and trust-center access requests. Uses a device code: show the user the returned URL and code, then call again with the returned deviceCode if the result is still pending. Free directory tools never need this.',
  inputSchema: {
    type: 'object',
    properties: {
      deviceCode: { type: 'string', description: 'Continue a pending login from a previous result.' },
      waitSeconds: { type: 'number', description: `Seconds to wait for approval before returning pending (default ${DEFAULT_WAIT_SECONDS}, max ${MAX_WAIT_SECONDS}).` },
      force: { type: 'boolean', description: 'Start a new login even if already signed in.' },
    },
  },
} as const;

// ── logout ────────────────────────────────────────────────────────────────

export const logoutInputSchema = z.object({});
export type LogoutInput = z.infer<typeof logoutInputSchema>;

export interface LogoutToolResult {
  signedOut: boolean;
  message: string;
}

export async function runLogout(_input: LogoutInput): Promise<LogoutToolResult> {
  const session = await readSession();
  if (!session) {
    return { signedOut: false, message: 'No trustlists session was stored on this machine.' };
  }
  // Best effort server-side revocation; the local file is removed either way.
  try {
    await publicPost('/api/companion/auth/logout', {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
  } catch {
    // Offline or already revoked. Local removal is what matters here.
  }
  await clearSession();
  return { signedOut: true, message: `Signed out ${session.user.email} and removed ${getAuthFilePath()}.` };
}

export const logoutToolDefinition = {
  name: 'trustlists_logout',
  description: 'Sign out of the trustlists account connected to this MCP and delete the stored credentials.',
  inputSchema: { type: 'object', properties: {} },
} as const;

// ── whoami ────────────────────────────────────────────────────────────────

export const whoamiInputSchema = z.object({});
export type WhoamiInput = z.infer<typeof whoamiInputSchema>;

export interface WhoamiToolResult {
  signedIn: boolean;
  user?: { id: string; email: string; displayName?: string | null };
  usage?: unknown;
  subscription?: unknown;
  vendorReviewsEnabled?: boolean;
  requesterProfile?: { complete: boolean; missing: string[] };
  appUrl: string;
  message: string;
}

export async function runWhoami(_input: WhoamiInput): Promise<WhoamiToolResult> {
  const session = await readSession();
  if (!session) {
    return {
      signedIn: false,
      appUrl: appUrl('/'),
      message: 'Not signed in. Run trustlists_login to connect a trustlists account.',
    };
  }

  try {
    const me = await companionFetch('/api/companion/me');
    const [reviews, profile] = await Promise.all([
      companionFetch('/api/companion/vendor-reviews', { allowStatuses: [404] }).catch(() => null),
      companionFetch<{ complete?: boolean; missing?: string[] }>('/api/companion/requester-profile').catch(() => null),
    ]);
    const user = (me.body.user || session.user) as WhoamiToolResult['user'];
    return {
      signedIn: true,
      user,
      usage: me.body.usage,
      subscription: me.body.subscription,
      vendorReviewsEnabled: reviews ? reviews.status === 200 : undefined,
      requesterProfile: profile
        ? { complete: Boolean(profile.body.complete), missing: Array.isArray(profile.body.missing) ? profile.body.missing : [] }
        : undefined,
      appUrl: appUrl('/home'),
      message: `Signed in as ${user?.email || session.user.email}.`,
    };
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return { signedIn: false, appUrl: appUrl('/'), message: error.message };
    }
    if (error instanceof CompanionApiError) {
      return { signedIn: true, user: session.user, appUrl: appUrl('/home'), message: `Signed in as ${session.user.email}, but the account lookup failed: ${error.message}` };
    }
    throw error;
  }
}

export const whoamiToolDefinition = {
  name: 'trustlists_whoami',
  description: 'Show which trustlists account this MCP is signed in as, remaining credits, and whether the requester profile needed for access requests is complete.',
  inputSchema: { type: 'object', properties: {} },
} as const;
