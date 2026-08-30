/**
 * trustlists_search: search the public trustlists directory by name or domain.
 */

import { z } from 'zod';
import {
  getRegistrySnapshot,
  searchVendors,
  type SearchResult,
} from '../api/client.js';

export const searchInputSchema = z.object({
  query: z.string().min(2, 'Query must be at least 2 characters'),
  limit: z.number().int().min(1).max(20).optional().default(8),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export interface SearchToolResult {
  query: string;
  totalMatches: number;
  results: Array<{
    name: string;
    domain: string | null;
    website: string | null;
    trustCenter?: string;
    inDirectory: boolean;
    certifications: string[];
    platform?: string;
    csaStarLevel?: number;
    lastVerified?: string;
    directoryUrl?: string;
    logo?: string | null;
  }>;
  registry: {
    source: 'trustlists.org' | 'github';
    total: number;
    generated?: string;
  };
  message: string;
  caveat: string;
}

export async function runSearch(input: SearchInput): Promise<SearchToolResult> {
  const { query, limit } = input;
  const [results, snapshot] = await Promise.all([
    searchVendors(query),
    getRegistrySnapshot(),
  ]);
  const limited = results.slice(0, limit);

  const formatted = limited.map((r: SearchResult) => ({
    name: r.name,
    domain: r.domain,
    website: r.website,
    trustCenter: r.trustCenter,
    inDirectory: true,
    certifications: r.certifications || [],
    platform: r.platform,
    csaStarLevel: r.csaStarLevel,
    lastVerified: r.lastVerified,
    directoryUrl: r.directoryUrl,
    logo: r.logo ?? null,
  }));

  const message = limited.length === 0
    ? `No matches for "${query}" in the trustlists directory.`
    : `Found ${limited.length} of ${results.length} directory matches for "${query}".`;

  return {
    query,
    totalMatches: results.length,
    results: formatted,
    registry: {
      source: snapshot.info.source,
      total: snapshot.info.total,
      generated: snapshot.info.generated,
    },
    message,
    caveat: 'Search returns directory records only. Listed frameworks are not independent compliance determinations.',
  };
}

export const searchToolDefinition = {
  name: 'trustlists_search',
  description:
    'Search thousands of public trust center records by company name or website domain. Returns directory matches with trust center URLs, platforms, listed frameworks, CSA STAR levels, and source pages. Use when the user gives a company name or partial domain.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Company name or domain to search for (min 2 characters).',
      },
      limit: {
        type: 'integer',
        description: 'Max results to return (1-20, default 8).',
        minimum: 1,
        maximum: 20,
        default: 8,
      },
    },
    required: ['query'],
  },
} as const;
