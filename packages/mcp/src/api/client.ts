/**
 * Public trustlists registry client.
 *
 * The MCP used to send lookup and search requests through app.trustlists.org.
 * Both endpoints fetched the public directory again on the server. If Vercel's
 * security checkpoint challenged that fetch, the app turned the 429 into a 500
 * and both core MCP tools stopped working.
 *
 * The registry is small enough to fetch once and query locally. We prefer the
 * public site and fail over to the open GitHub data mirror, which removes the
 * app server from the free lookup path and keeps the MCP useful when either
 * public host has a transient problem.
 */

const PLUGIN_VERSION = '0.2.1';
const USER_AGENT = `trustlists-mcp/${PLUGIN_VERSION}`;
const SOURCE_HEADER_VALUE = 'mcp';
const FETCH_TIMEOUT_MS = 15_000;

export const TRUSTLISTS_REGISTRY_URL = 'https://trustlists.org/api/trust-centers.json';
export const TRUSTLISTS_REGISTRY_FALLBACK_URL =
  'https://raw.githubusercontent.com/trustlists/trustlists-data/main/data/trust-centers.json';
export const TRUSTLISTS_DIRECTORY_URL = 'https://trustlists.org';

export interface RegistryEntry {
  name: string;
  website: string;
  trustCenter: string;
  platform: string;
  iconUrl?: string;
  certifications?: string[];
  csaStar?: {
    level: number;
    registryUrl?: string;
    assessments?: string[];
    listedSince?: string;
  };
  lastVerified?: string;
  useBrandfetch?: boolean;
}

export interface LookupResult {
  found: boolean;
  name?: string;
  trustCenter?: string;
  website?: string;
  entry?: RegistryEntry;
}

export interface SearchResult {
  source: 'trustlists';
  name: string;
  domain: string | null;
  website: string | null;
  trustCenter?: string;
  logo?: string | null;
  certifications?: string[];
  platform?: string;
  csaStarLevel?: number;
  lastVerified?: string;
  directoryUrl?: string;
}

export interface RegistryInfo {
  source: 'trustlists.org' | 'github';
  sourceUrl: string;
  total: number;
  generated?: string;
  version?: string;
  fetchedAt: string;
}

interface RegistryPayload {
  data?: RegistryEntry[];
  meta?: {
    total?: number;
    generated?: string;
    version?: string;
  };
}

interface RegistrySnapshot {
  entries: RegistryEntry[];
  info: RegistryInfo;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const REGISTRY_CACHE_TTL_MS = 10 * 60 * 1000;
let registryCache: CacheEntry<RegistrySnapshot> | null = null;
let registryRefresh: Promise<RegistrySnapshot> | null = null;

function defaultHeaders(): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    'X-Trustlists-Source': SOURCE_HEADER_VALUE,
    'X-Trustlists-Version': PLUGIN_VERSION,
    Accept: 'application/json',
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...defaultHeaders(),
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      const mitigated = response.headers.get('x-vercel-mitigated');
      const detail = mitigated ? ` (${mitigated})` : '';
      throw new Error(`trustlists data request returned ${response.status}${detail}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshRegistrySnapshot(): Promise<RegistrySnapshot> {
  const sources = [
    { source: 'trustlists.org' as const, url: TRUSTLISTS_REGISTRY_URL },
    { source: 'github' as const, url: TRUSTLISTS_REGISTRY_FALLBACK_URL },
  ];
  const failures: string[] = [];

  for (const candidate of sources) {
    try {
      const json = await fetchJson<RegistryPayload>(candidate.url);
      const entries = Array.isArray(json?.data) ? json.data : [];
      if (entries.length === 0) {
        throw new Error('registry was empty');
      }
      const snapshot: RegistrySnapshot = {
        entries,
        info: {
          source: candidate.source,
          sourceUrl: candidate.url,
          total: Number(json?.meta?.total) || entries.length,
          generated: json?.meta?.generated,
          version: json?.meta?.version,
          fetchedAt: new Date().toISOString(),
        },
      };
      registryCache = {
        value: snapshot,
        expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS,
      };
      return snapshot;
    } catch (error) {
      failures.push(
        `${candidate.source}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(`Could not load the public trustlists registry. ${failures.join('; ')}`);
}

/**
 * Fetch the full trustlists registry. Cached for 10 minutes per process.
 * Concurrent cache misses share one refresh request.
 */
export async function getRegistrySnapshot(): Promise<RegistrySnapshot> {
  if (registryCache && registryCache.expiresAt > Date.now()) {
    return registryCache.value;
  }

  if (!registryRefresh) {
    registryRefresh = refreshRegistrySnapshot().finally(() => {
      registryRefresh = null;
    });
  }

  return registryRefresh;
}

export async function getRegistry(): Promise<RegistryEntry[]> {
  return (await getRegistrySnapshot()).entries;
}

/**
 * Look up a single vendor by exact domain against the local registry snapshot.
 */
export async function lookupByDomain(domain: string): Promise<LookupResult> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return { found: false };
  const registry = await getRegistry();
  const entry = registry.find(
    (candidate) => normalizeDomain(candidate.website) === normalized,
  );
  if (!entry) return { found: false };
  return {
    found: true,
    name: entry.name,
    trustCenter: entry.trustCenter,
    website: entry.website,
    entry,
  };
}

/**
 * Search the public registry by company name or website domain.
 */
export async function searchVendors(query: string): Promise<SearchResult[]> {
  const trimmed = (query || '').trim();
  if (trimmed.length < 2) return [];
  return searchRegistry(await getRegistry(), trimmed);
}

export function searchRegistry(
  registry: RegistryEntry[],
  query: string,
): SearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  if (normalizedQuery.length < 2) return [];

  return registry
    .map((entry) => {
      const name = String(entry.name || '').toLowerCase();
      const domain = normalizeDomain(entry.website);
      if (!name.includes(normalizedQuery) && !domain.includes(normalizedQuery)) {
        return null;
      }

      let score = 10;
      if (name === normalizedQuery || domain === normalizedQuery) score = 200;
      else if (name.startsWith(normalizedQuery) || domain.startsWith(normalizedQuery)) {
        score = 100;
      } else if (
        name.includes(` ${normalizedQuery}`)
        || name.split(/[\s-]/).includes(normalizedQuery)
      ) {
        score = 50;
      }
      score -= Math.abs(name.length - normalizedQuery.length) * 0.5;
      return { entry, domain, score };
    })
    .filter(
      (candidate): candidate is {
        entry: RegistryEntry;
        domain: string;
        score: number;
      } => candidate !== null,
    )
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .map(({ entry, domain }) => formatSearchResult(entry, domain));
}

export function formatSearchResult(
  entry: RegistryEntry,
  domain = normalizeDomain(entry.website),
): SearchResult {
  return {
    source: 'trustlists',
    name: entry.name,
    domain: domain || null,
    website: entry.website || null,
    trustCenter: entry.trustCenter,
    certifications: entry.certifications || [],
    platform: entry.platform,
    csaStarLevel: entry.csaStar?.level,
    lastVerified: entry.lastVerified,
    directoryUrl: companyDirectoryUrl(entry.name),
  };
}

export function companyDirectoryUrl(name: string): string {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${TRUSTLISTS_DIRECTORY_URL}/company/${slug}/`;
}

export function resetRegistryCacheForTests(): void {
  registryCache = null;
  registryRefresh = null;
}

/**
 * Normalize an arbitrary user input into a bare hostname like 'stripe.com'.
 * Handles full URLs, www prefixes, trailing paths, and casing.
 */
export function normalizeDomain(input: string | undefined | null): string {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();
  }
}
