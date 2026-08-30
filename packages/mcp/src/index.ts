#!/usr/bin/env node
/**
 * trustlists MCP server entry point.
 *
 * Spawned by Cursor / Claude Code via `npx -y @trustlists/mcp`.
 * Speaks JSON-RPC over stdio per the Model Context Protocol spec.
 *
 * v0.2.1 ships four free tools:
 *   - trustlists_search
 *   - trustlists_lookup
 *   - trustlists_browse
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

import { allToolDefinitions, executeTool } from './execute-tool.js';
import { SERVER_NAME, SERVER_VERSION } from './version.js';

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
  tools: [...allToolDefinitions],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return executeTool(name, args, { allowAudit: true });
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
