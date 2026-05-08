#!/usr/bin/env node
/**
 * TrustLists MCP server entry point.
 *
 * Spawned by Cursor / Claude Code via `npx -y @trustlists/mcp`.
 * Speaks JSON-RPC over stdio per the Model Context Protocol spec.
 *
 * v0.1.1 ships three free tools:
 *   - trustlists_search
 *   - trustlists_lookup
 *   - trustlists_audit_dependencies
 *
 * No auth required for any of these. Future paid endpoints (ai-lookup,
 * soc2-analyze, request-access) will use a Bearer token from
 * ~/.trustlists/auth.json populated by the device-auth flow.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { runSearch, searchInputSchema, searchToolDefinition } from './tools/search.js';
import { runLookup, lookupInputSchema, lookupToolDefinition } from './tools/lookup.js';
import {
  runAudit,
  auditInputSchema,
  auditToolDefinition,
} from './tools/audit-dependencies.js';

const SERVER_NAME = 'trustlists';
const SERVER_VERSION = '0.1.1';

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [searchToolDefinition, lookupToolDefinition, auditToolDefinition],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'trustlists_search': {
        const input = searchInputSchema.parse(args ?? {});
        const result = await runSearch(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'trustlists_lookup': {
        const input = lookupInputSchema.parse(args ?? {});
        const result = await runLookup(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'trustlists_audit_dependencies': {
        const input = auditInputSchema.parse(args ?? {});
        const result = await runAudit(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

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
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't pollute stdout (which is the JSON-RPC channel).
  console.error(`[trustlists-mcp] v${SERVER_VERSION} running on stdio`);
}

main().catch((error) => {
  console.error('[trustlists-mcp] fatal:', error);
  process.exit(1);
});
