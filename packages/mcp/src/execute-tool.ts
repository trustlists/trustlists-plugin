import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runSearch, searchInputSchema, searchToolDefinition } from './tools/search.js';
import { runLookup, lookupInputSchema, lookupToolDefinition } from './tools/lookup.js';
import { runBrowse, browseInputSchema, browseToolDefinition } from './tools/browse.js';
import {
  runAudit,
  auditInputSchema,
  auditToolDefinition,
} from './tools/audit-dependencies.js';

export const directoryToolDefinitions = [
  searchToolDefinition,
  lookupToolDefinition,
  browseToolDefinition,
] as const;

export const allToolDefinitions = [
  ...directoryToolDefinitions,
  auditToolDefinition,
] as const;

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

export function auditUnavailableResult(): CallToolResult {
  return {
    content: [{
      type: 'text',
      text: 'trustlists_audit_dependencies reads local dependency manifests and is only available on the stdio MCP server (npx -y @trustlists/mcp). Use trustlists_search, trustlists_lookup, or trustlists_browse on this remote endpoint.',
    }],
    isError: true,
  };
}

export async function executeTool(
  name: string,
  args: unknown,
  options: { allowAudit?: boolean } = {},
): Promise<CallToolResult> {
  const allowAudit = options.allowAudit !== false;

  try {
    switch (name) {
      case 'trustlists_search':
        return jsonResult(await runSearch(searchInputSchema.parse(args ?? {})));
      case 'trustlists_lookup':
        return jsonResult(await runLookup(lookupInputSchema.parse(args ?? {})));
      case 'trustlists_browse':
        return jsonResult(await runBrowse(browseInputSchema.parse(args ?? {})));
      case 'trustlists_audit_dependencies':
        if (!allowAudit) return auditUnavailableResult();
        return jsonResult(await runAudit(auditInputSchema.parse(args ?? {})));
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Tool ${name} failed: ${message}` }],
      isError: true,
    };
  }
}
