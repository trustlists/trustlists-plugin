#!/usr/bin/env node
/**
 * trustlists MCP server entry point.
 *
 * Spawned by Cursor / Claude Code via `npx -y @trustlists/mcp`.
 * Speaks JSON-RPC over stdio per the Model Context Protocol spec.
 *
 * v0.3.0 ships the public directory tools plus account tools that read
 * ~/.trustlists/auth.json on this machine:
 *   - trustlists_search / lookup / browse (free, no auth)
 *   - trustlists_audit_dependencies (free, local files)
 *   - trustlists_login / logout / whoami
 *   - trustlists_soc2_analyze / status / report
 *   - trustlists_requester_profile
 *   - trustlists_access_request / status / continue / request_batch
 *
 * The hosted HTTP endpoint stays the three public directory tools.
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
  return executeTool(name, args, { allowAudit: true, allowAccount: true });
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
