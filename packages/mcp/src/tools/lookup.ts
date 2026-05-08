/**
 * trustlists_lookup — exact-domain vendor lookup.
 *
 * Use when you have a domain and want a definitive yes/no answer about whether
 * the vendor publishes a trust center, plus their certifications.
 */

import { z } from 'zod';
import { getRegistry, lookupByDomain, normalizeDomain, type RegistryEntry } from '../api/client.js';

export const lookupInputSchema = z.object({
  domain: z.string().min(3, 'Domain must be at least 3 characters'),
});

export type LookupInput = z.infer<typeof lookupInputSchema>;

export interface LookupToolResult {
  found: boolean;
  domain: string;
  result?: {
    name: string;
    website: string;
    trustCenter: string;
    platform?: string;
    certifications: string[];
    csaStarLevel?: number;
    lastVerified?: string;
  };
  message: string;
}

export async function runLookup(input: LookupInput): Promise<LookupToolResult> {
  const normalized = normalizeDomain(input.domain);
  if (!normalized) {
    return {
      found: false,
      domain: input.domain,
      message: 'Invalid domain. Provide a hostname like "stripe.com" or a URL.',
    };
  }

  const lookup = await lookupByDomain(normalized);

  if (!lookup.found) {
    return {
      found: false,
      domain: normalized,
      message: `No trust center found for ${normalized} in the public TrustLists registry. The vendor may not publish one, or it may be hosted at a different domain. Consider searching by name with trustlists_search.`,
    };
  }

  let registryEntry: RegistryEntry | undefined;
  try {
    const registry = await getRegistry();
    registryEntry = registry.find((entry) => normalizeDomain(entry.website) === normalized);
  } catch {
    registryEntry = undefined;
  }

  return {
    found: true,
    domain: normalized,
    result: {
      name: lookup.name || registryEntry?.name || normalized,
      website: lookup.website || registryEntry?.website || `https://${normalized}`,
      trustCenter: lookup.trustCenter || registryEntry?.trustCenter || '',
      platform: registryEntry?.platform,
      certifications: registryEntry?.certifications || [],
      csaStarLevel: registryEntry?.csaStar?.level,
      lastVerified: registryEntry?.lastVerified,
    },
    message: `Found ${lookup.name} in the TrustLists registry.`,
  };
}

export const lookupToolDefinition = {
  name: 'trustlists_lookup',
  description:
    'Look up a single company in the TrustLists registry by exact domain. Returns trust center URL, platform, certifications, and CSA STAR status if available. Use this when you have a domain and want a definitive answer.',
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Domain like "stripe.com" or a full URL.',
      },
    },
    required: ['domain'],
  },
} as const;
