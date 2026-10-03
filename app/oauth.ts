import { createHash } from 'node:crypto';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { generateProtectedResourceMetadata, getPublicOrigin } from 'mcp-handler';
import { verifyAccessToken } from '@trustlists/mcp/companion';

/**
 * The OAuth authorization server for the hosted endpoint is Supabase Auth on
 * the trustlists project. It must match the `issuer` in its RFC 8414 metadata.
 */
export const OAUTH_ISSUER = (
  process.env.TRUSTLISTS_OAUTH_ISSUER || 'https://lztxqriqlzugtcdpmmti.supabase.co/auth/v1'
).replace(/\/+$/, '');

/** RFC 9728 metadata for the /mcp resource, served at both well-known paths. */
export function protectedResourceMetadataResponse(req: Request): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [OAUTH_ISSUER],
    resourceUrl: `${getPublicOrigin(req)}/mcp`,
    additionalMetadata: {
      resource_name: 'trustlists',
      bearer_methods_supported: ['header'],
    },
  });
  return new Response(JSON.stringify(metadata), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'max-age=3600',
      'Content-Type': 'application/json',
    },
  });
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;
const verified = new Map<string, { authInfo: AuthInfo; cachedAt: number }>();

function tokenKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Seconds since epoch from the token's exp claim, if it has one. */
function tokenExpiry(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

function tokenClientId(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    return typeof payload.client_id === 'string' ? payload.client_id : 'trustlists';
  } catch {
    return 'trustlists';
  }
}

/**
 * Resolve the bearer token to a trustlists user by asking the app, which
 * validates it with Supabase Auth. Results are cached briefly so a burst of
 * tool calls does not re-check the same token every time.
 */
export async function verifyBearerToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  const token = String(bearerToken || '').trim();
  if (!token) return undefined;

  const key = tokenKey(token);
  const hit = verified.get(key);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.authInfo;

  const user = await verifyAccessToken(token);
  if (!user) {
    verified.delete(key);
    return undefined;
  }

  const authInfo: AuthInfo = {
    token,
    clientId: tokenClientId(token),
    scopes: [],
    expiresAt: tokenExpiry(token),
    extra: { user },
  };

  if (verified.size >= CACHE_MAX_ENTRIES) {
    const oldest = verified.keys().next().value;
    if (oldest) verified.delete(oldest);
  }
  verified.set(key, { authInfo, cachedAt: Date.now() });
  return authInfo;
}
