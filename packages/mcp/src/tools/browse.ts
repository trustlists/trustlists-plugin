/**
 * trustlists_browse: filter the public directory by platform, listed framework,
 * or CSA STAR level.
 */

import { z } from 'zod';
import {
  formatSearchResult,
  getRegistrySnapshot,
  type RegistryEntry,
} from '../api/client.js';

export const browseInputSchema = z.object({
  platform: z.string().trim().min(1).optional(),
  framework: z.string().trim().min(1).optional(),
  csaStarLevel: z.union([z.literal(1), z.literal(2)]).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export type BrowseInput = z.infer<typeof browseInputSchema>;

export interface BrowseToolResult {
  filters: {
    platform?: string;
    framework?: string;
    csaStarLevel?: 1 | 2;
  };
  totalMatches: number;
  offset: number;
  limit: number;
  results: ReturnType<typeof formatSearchResult>[];
  availablePlatforms: string[];
  matchedFrameworks: string[];
  registry: {
    source: 'trustlists.org' | 'github';
    total: number;
    generated?: string;
  };
  message: string;
  caveat: string;
}

function normalized(value: string | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function includesValue(values: string[] | undefined, query: string): boolean {
  const needle = normalized(query);
  return (values || []).some((value) => normalized(value).includes(needle));
}

export function filterRegistry(
  registry: RegistryEntry[],
  input: Pick<BrowseInput, 'platform' | 'framework' | 'csaStarLevel'>,
): RegistryEntry[] {
  const platform = normalized(input.platform);
  const framework = normalized(input.framework);

  return registry
    .filter((entry) => {
      if (platform && normalized(entry.platform) !== platform) return false;
      if (framework && !includesValue(entry.certifications, framework)) return false;
      if (
        input.csaStarLevel != null
        && Number(entry.csaStar?.level) !== input.csaStarLevel
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function runBrowse(input: BrowseInput): Promise<BrowseToolResult> {
  const snapshot = await getRegistrySnapshot();
  const matches = filterRegistry(snapshot.entries, input);
  const page = matches.slice(input.offset, input.offset + input.limit);
  const availablePlatforms = [...new Set(
    snapshot.entries.map((entry) => entry.platform).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
  const matchedFrameworks = [...new Set(
    matches.flatMap((entry) => entry.certifications || []),
  )].sort((a, b) => a.localeCompare(b));

  return {
    filters: {
      platform: input.platform,
      framework: input.framework,
      csaStarLevel: input.csaStarLevel,
    },
    totalMatches: matches.length,
    offset: input.offset,
    limit: input.limit,
    results: page.map((entry) => formatSearchResult(entry)),
    availablePlatforms,
    matchedFrameworks,
    registry: {
      source: snapshot.info.source,
      total: snapshot.info.total,
      generated: snapshot.info.generated,
    },
    message: matches.length === 0
      ? 'No directory records match those filters.'
      : `Returning ${page.length} of ${matches.length} matching directory records.`,
    caveat: 'Filters use directory labels. A listed framework does not establish certification scope, validity, or legal compliance.',
  };
}

export const browseToolDefinition = {
  name: 'trustlists_browse',
  description:
    'Browse the public trustlists directory by exact trust center platform, listed framework, or CSA STAR level. Use for questions like "show SafeBase-hosted vendors", "find entries listing ISO 27001", or "list CSA STAR Level 2 companies". Results are directory metadata, not security ratings.',
  inputSchema: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        description: 'Exact platform name, such as "Vanta", "SafeBase", or "Self-hosted".',
      },
      framework: {
        type: 'string',
        description: 'Case-insensitive listed framework text, such as "SOC 2", "ISO 27001", or "PCI DSS".',
      },
      csaStarLevel: {
        type: 'integer',
        enum: [1, 2],
        description: 'CSA STAR registry level.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Maximum records to return (1-100, default 20).',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        default: 0,
        description: 'Number of matching records to skip for pagination.',
      },
    },
  },
} as const;
