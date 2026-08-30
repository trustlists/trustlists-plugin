/**
 * trustlists_lookup: exact-domain vendor lookup.
 *
 * Use when you have a domain and want a definitive yes/no answer about whether
 * the vendor publishes a trust center, plus their certifications.
 */

import { z } from 'zod';
import {
  companyDirectoryUrl,
  getRegistrySnapshot,
  lookupByDomain,
  normalizeDomain,
} from '../api/client.js';

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
    directoryUrl: string;
  };
  registry: {
    source: 'trustlists.org' | 'github';
    total: number;
    generated?: string;
  };
  message: string;
  caveat: string;
}

export async function runLookup(input: LookupInput): Promise<LookupToolResult> {
  const normalized = normalizeDomain(input.domain);
  if (!normalized) {
    return {
      found: false,
      domain: input.domain,
      registry: {
        source: 'trustlists.org',
        total: 0,
      },
      message: 'Invalid domain. Provide a hostname like "stripe.com" or a URL.',
      caveat: 'A directory record is a discovery aid, not an audit, certification, endorsement, or security rating.',
    };
  }

  const [lookup, snapshot] = await Promise.all([
    lookupByDomain(normalized),
    getRegistrySnapshot(),
  ]);

  if (!lookup.found) {
    return {
      found: false,
      domain: normalized,
      registry: {
        source: snapshot.info.source,
        total: snapshot.info.total,
        generated: snapshot.info.generated,
      },
      message: `No trust center found for ${normalized} in the public trustlists registry. The vendor may not publish one, or it may be registered under a different domain. Consider searching by name with trustlists_search.`,
      caveat: 'Not found means only that the current directory has no matching record. It does not mean the vendor lacks security documentation.',
    };
  }

  const registryEntry = lookup.entry;
  const name = lookup.name || registryEntry?.name || normalized;

  return {
    found: true,
    domain: normalized,
    result: {
      name,
      website: lookup.website || registryEntry?.website || `https://${normalized}`,
      trustCenter: lookup.trustCenter || registryEntry?.trustCenter || '',
      platform: registryEntry?.platform,
      certifications: registryEntry?.certifications || [],
      csaStarLevel: registryEntry?.csaStar?.level,
      lastVerified: registryEntry?.lastVerified,
      directoryUrl: companyDirectoryUrl(name),
    },
    registry: {
      source: snapshot.info.source,
      total: snapshot.info.total,
      generated: snapshot.info.generated,
    },
    message: `Found ${name} in the trustlists directory.`,
    caveat: 'Listed frameworks describe what the directory record links or labels. Confirm current scope, validity, and document access with the vendor.',
  };
}

export const lookupToolDefinition = {
  name: 'trustlists_lookup',
  description:
    'Look up one company in the public trustlists directory by exact website domain. Returns its trust center URL, platform, listed frameworks, CSA STAR level, verification date, and directory page. Directory metadata is a discovery aid, not proof of compliance.',
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
