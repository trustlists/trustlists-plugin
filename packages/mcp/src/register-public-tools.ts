import type { ZodTypeAny } from 'zod';
import { executeTool } from './execute-tool.js';
import { searchInputSchema, searchToolDefinition } from './tools/search.js';
import { lookupInputSchema, lookupToolDefinition } from './tools/lookup.js';
import { browseInputSchema, browseToolDefinition } from './tools/browse.js';

type PublicToolServer = {
  registerTool: (
    name: string,
    config: { description?: string; inputSchema?: ZodTypeAny },
    cb: (args: unknown) => ReturnType<typeof executeTool>,
  ) => unknown;
};

/**
 * Register the three public directory tools on an MCP server.
 * Used by the hosted Streamable HTTP endpoint. Audit stays local-only.
 */
export function registerPublicDirectoryTools(server: PublicToolServer): void {
  server.registerTool(
    searchToolDefinition.name,
    {
      description: searchToolDefinition.description,
      inputSchema: searchInputSchema,
    },
    async (args) => executeTool(searchToolDefinition.name, args, { allowAudit: false }),
  );

  server.registerTool(
    lookupToolDefinition.name,
    {
      description: lookupToolDefinition.description,
      inputSchema: lookupInputSchema,
    },
    async (args) => executeTool(lookupToolDefinition.name, args, { allowAudit: false }),
  );

  server.registerTool(
    browseToolDefinition.name,
    {
      description: browseToolDefinition.description,
      inputSchema: browseInputSchema,
    },
    async (args) => executeTool(browseToolDefinition.name, args, { allowAudit: false }),
  );
}
