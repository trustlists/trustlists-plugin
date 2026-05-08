/**
 * trustlists_search — search the TrustLists registry by name or domain.
 *
 * Returns ranked matches from the public registry plus, when available,
 * Brandfetch results for vendors not yet in our directory.
 */

import { z } from 'zod';
import { searchVendors, type SearchResult } from '../api/client.js';

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
    logo?: string | null;
  }>;
  message: string;
}

export async function runSearch(input: SearchInput): Promise<SearchToolResult> {
  const { query, limit } = input;
  const results = await searchVendors(query);
  const limited = results.slice(0, limit);
  const inDirectoryCount = limited.filter((r) => r.source === 'trustlists').length;

  const formatted = limited.map((r: SearchResult) => ({
    name: r.name,
    domain: r.domain,
    website: r.website,
    trustCenter: r.trustCenter,
    inDirectory: r.source === 'trustlists',
    certifications: r.certifications || [],
    logo: r.logo ?? null,
  }));

  const message = limited.length === 0
    ? `No matches for "${query}" in the TrustLists registry.`
    : inDirectoryCount > 0
      ? `Found ${limited.length} matches (${inDirectoryCount} in directory) for "${query}".`
      : `No directory matches. Suggestions from Brandfetch: ${limited.length}.`;

  return {
    query,
    totalMatches: results.length,
    results: formatted,
    message,
  };
}

export const searchToolDefinition = {
  name: 'trustlists_search',
  description:
    'Search the TrustLists registry of 2,000+ company trust centers by name or domain. Returns matching companies with their trust center URLs, certifications, and security platforms (Vanta, SafeBase, Drata, etc.). Use this when the user asks about a vendor by name and you want suggestions.',
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
