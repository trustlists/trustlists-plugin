import { ZodEffects, type ZodTypeAny } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getAppBaseUrl, runWithRequestSession, type StoredSession } from './auth/store.js';
import { executeTool } from './execute-tool.js';
import { searchInputSchema, searchToolDefinition } from './tools/search.js';
import { lookupInputSchema, lookupToolDefinition } from './tools/lookup.js';
import { browseInputSchema, browseToolDefinition } from './tools/browse.js';
import { auditManifestsDescription, auditManifestsInputSchema, auditToolDefinition } from './tools/audit-dependencies.js';
import { whoamiInputSchema, whoamiToolDefinition } from './tools/auth.js';
import {
  soc2ReportInputSchema,
  soc2ReportToolDefinition,
  soc2StatusInputSchema,
  soc2StatusToolDefinition,
  soc2UploadInputSchema,
  soc2UploadToolDefinition,
} from './tools/soc2.js';
import {
  accessContinueInputSchema,
  accessContinueToolDefinition,
  accessRequestBatchInputSchema,
  accessRequestBatchToolDefinition,
  accessRequestInputSchema,
  accessRequestToolDefinition,
  accessStatusInputSchema,
  accessStatusToolDefinition,
  requesterProfileInputSchema,
  requesterProfileToolDefinition,
} from './tools/access.js';

/** Identity attached to a verified hosted request by the HTTP layer. */
export interface HostedAuthInfo {
  token: string;
  expiresAt?: number;
  extra?: Record<string, unknown>;
}

type ToolExtra = { authInfo?: HostedAuthInfo };

type HostedToolServer = {
  registerTool: (
    name: string,
    config: { description?: string; inputSchema?: ZodTypeAny },
    cb: (args: unknown, extra: ToolExtra) => Promise<CallToolResult>,
  ) => unknown;
};

/** The MCP SDK lists tool inputs from a plain object schema, not a refined one. */
function listedSchema(schema: ZodTypeAny): ZodTypeAny {
  return schema instanceof ZodEffects ? schema.innerType() : schema;
}

/** Sign-in happens when the user connects the app, so drop stdio login hints. */
function hostedDescription(description: string): string {
  return description
    .replace(/\s*\(requires trustlists_login\)/gi, '')
    .replace(/;\s*requires trustlists_login/gi, '')
    .replace(/\s*Requires trustlists_login\.?/gi, '')
    .replace(/trustlists_soc2_analyze/g, 'trustlists_soc2_upload')
    .trim();
}

function sessionFromAuth(authInfo: HostedAuthInfo | undefined): StoredSession | null {
  const user = authInfo?.extra?.user as { id?: string; email?: string; displayName?: string | null } | undefined;
  if (!authInfo?.token || !user?.id) return null;
  return {
    baseUrl: getAppBaseUrl(),
    accessToken: authInfo.token,
    refreshToken: '',
    expiresAt: authInfo.expiresAt ? authInfo.expiresAt * 1000 : Date.now() + 15 * 60 * 1000,
    user: { id: user.id, email: user.email || '', displayName: user.displayName ?? null },
    savedAt: new Date().toISOString(),
  };
}

const NOT_CONNECTED: CallToolResult = {
  content: [{ type: 'text', text: 'This tool needs a connected trustlists account. Connect the trustlists app in your AI client and try again.' }],
  isError: true,
};

/**
 * Register the public directory tools on an MCP server.
 * Used by any endpoint that serves the directory without sign-in.
 */
export function registerPublicDirectoryTools(server: HostedToolServer): void {
  const tools: Array<[string, string, ZodTypeAny]> = [
    [searchToolDefinition.name, searchToolDefinition.description, searchInputSchema],
    [lookupToolDefinition.name, lookupToolDefinition.description, lookupInputSchema],
    [browseToolDefinition.name, browseToolDefinition.description, browseInputSchema],
  ];
  for (const [name, description, inputSchema] of tools) {
    server.registerTool(name, { description, inputSchema }, async (args) => (
      executeTool(name, args, { allowAudit: false })
    ));
  }
}

/**
 * Register every tool the hosted endpoint serves after OAuth sign-in. Account
 * tools run with the caller's token from the verified request; nothing is
 * read from or written to the server's disk.
 */
export function registerHostedTools(server: HostedToolServer): void {
  registerPublicDirectoryTools(server);

  server.registerTool(
    auditToolDefinition.name,
    { description: auditManifestsDescription, inputSchema: auditManifestsInputSchema },
    async (args) => executeTool(auditToolDefinition.name, args, { allowAudit: false }),
  );

  const accountTools: Array<[string, string, ZodTypeAny]> = [
    [whoamiToolDefinition.name, whoamiToolDefinition.description, whoamiInputSchema],
    [soc2UploadToolDefinition.name, soc2UploadToolDefinition.description, soc2UploadInputSchema],
    [soc2StatusToolDefinition.name, soc2StatusToolDefinition.description, soc2StatusInputSchema],
    [soc2ReportToolDefinition.name, soc2ReportToolDefinition.description, soc2ReportInputSchema],
    [requesterProfileToolDefinition.name, requesterProfileToolDefinition.description, requesterProfileInputSchema],
    [accessRequestToolDefinition.name, accessRequestToolDefinition.description, accessRequestInputSchema],
    [accessStatusToolDefinition.name, accessStatusToolDefinition.description, accessStatusInputSchema],
    [accessContinueToolDefinition.name, accessContinueToolDefinition.description, accessContinueInputSchema],
    [accessRequestBatchToolDefinition.name, accessRequestBatchToolDefinition.description, accessRequestBatchInputSchema],
  ];

  for (const [name, description, inputSchema] of accountTools) {
    server.registerTool(
      name,
      { description: hostedDescription(description), inputSchema: listedSchema(inputSchema) },
      async (args, extra) => {
        const session = sessionFromAuth(extra?.authInfo);
        if (!session) return NOT_CONNECTED;
        return runWithRequestSession(session, () => executeTool(name, args, { allowAudit: false, allowAccount: true }));
      },
    );
  }
}
