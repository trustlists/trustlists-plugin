/**
 * TrustLists API client.
 *
 * Wraps calls to the public TrustLists APIs:
 *   - https://trustlists.org/api/trust-centers.json (registry)
 *   - https://app.trustlists.org/api/trustlists/lookup (single domain)
 *   - https://app.trustlists.org/api/trustlists/search (autocomplete)
 *
 * No auth required for any of these. Future paid endpoints (ai-lookup,
 * soc2-analyze, request-access) will use Bearer auth tokens stored in
 * ~/.trustlists/auth.json.
 */

const PLUGIN_VERSION = '0.1.0';
const USER_AGENT = `TrustListsMCP/${PLUGIN_VERSION}`;
const SOURCE_HEADER_VALUE = 'cursor-plugin';

export const TRUSTLISTS_REGISTRY_URL = 'https://trustlists.org/api/trust-centers.json';
export const TRUSTLISTS_LOOKUP_URL = 'https://app.trustlists.org/api/trustlists/lookup';
export const TRUSTLISTS_SEARCH_URL = 'https://app.trustlists.org/api/trustlists/search';

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
}

export interface SearchResult {
  source: 'trustlists' | 'brandfetch';
  name: string;
  domain: string | null;
  website: string | null;
  trustCenter?: string;
  logo?: string | null;
  certifications?: string[];
  qualityScore?: number;
  claimed?: boolean;
  verified?: boolean;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const REGISTRY_CACHE_TTL_MS = 10 * 60 * 1000;
let registryCache: CacheEntry<RegistryEntry[]> | null = null;

const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const lookupCache = new Map<string, CacheEntry<LookupResult>>();

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const searchCache = new Map<string, CacheEntry<SearchResult[]>>();

function defaultHeaders(): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    'X-TrustLists-Source': SOURCE_HEADER_VALUE,
    'X-TrustLists-Version': PLUGIN_VERSION,
    Accept: 'application/json',
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...defaultHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`TrustLists API error ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

/**
 * Fetch the full TrustLists registry. Cached for 10 minutes per process.
 */
export async function getRegistry(): Promise<RegistryEntry[]> {
  const now = Date.now();
  if (registryCache && registryCache.expiresAt > now) {
    return registryCache.value;
  }
  const json = await fetchJson<{ data: RegistryEntry[] }>(TRUSTLISTS_REGISTRY_URL);
  const data = Array.isArray(json?.data) ? json.data : [];
  registryCache = { value: data, expiresAt: now + REGISTRY_CACHE_TTL_MS };
  return data;
}

/**
 * Look up a single vendor by exact domain. Uses the lookup endpoint which
 * is cheaper than fetching the full registry.
 */
export async function lookupByDomain(domain: string): Promise<LookupResult> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return { found: false };

  const now = Date.now();
  const cached = lookupCache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const url = `${TRUSTLISTS_LOOKUP_URL}?domain=${encodeURIComponent(normalized)}`;
  const result = await fetchJson<LookupResult>(url);
  lookupCache.set(normalized, { value: result, expiresAt: now + LOOKUP_CACHE_TTL_MS });
  return result;
}

/**
 * Autocomplete search across registry + Brandfetch. Used for fuzzy name lookups.
 */
export async function searchVendors(query: string): Promise<SearchResult[]> {
  const trimmed = (query || '').trim();
  if (trimmed.length < 2) return [];

  const cacheKey = trimmed.toLowerCase();
  const now = Date.now();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const url = `${TRUSTLISTS_SEARCH_URL}?q=${encodeURIComponent(trimmed)}`;
  const json = await fetchJson<{ results: SearchResult[] }>(url);
  const results = Array.isArray(json?.results) ? json.results : [];
  searchCache.set(cacheKey, { value: results, expiresAt: now + SEARCH_CACHE_TTL_MS });
  return results;
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
