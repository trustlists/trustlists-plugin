import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { NotSignedInError } from './api/companion.js';
import { runSearch, searchInputSchema, searchToolDefinition } from './tools/search.js';
import { runLookup, lookupInputSchema, lookupToolDefinition } from './tools/lookup.js';
import { runBrowse, browseInputSchema, browseToolDefinition } from './tools/browse.js';
import {
  runAudit,
  auditInputSchema,
  auditToolDefinition,
} from './tools/audit-dependencies.js';
import {
  loginInputSchema,
  loginToolDefinition,
  logoutInputSchema,
  logoutToolDefinition,
  runLogin,
  runLogout,
  runWhoami,
  whoamiInputSchema,
  whoamiToolDefinition,
} from './tools/auth.js';
import {
  runSoc2Analyze,
  runSoc2Report,
  runSoc2Status,
  soc2AnalyzeInputSchema,
  soc2AnalyzeToolDefinition,
  soc2ReportInputSchema,
  soc2ReportToolDefinition,
  soc2StatusInputSchema,
  soc2StatusToolDefinition,
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
  runAccessContinue,
  runAccessRequest,
  runAccessRequestBatch,
  runAccessStatus,
  runRequesterProfile,
} from './tools/access.js';
import { ACCOUNT_TOOL_NAMES } from './version.js';

export const directoryToolDefinitions = [
  searchToolDefinition,
  lookupToolDefinition,
  browseToolDefinition,
] as const;

export const accountToolDefinitions = [
  loginToolDefinition,
  logoutToolDefinition,
  whoamiToolDefinition,
  soc2AnalyzeToolDefinition,
  soc2StatusToolDefinition,
  soc2ReportToolDefinition,
  requesterProfileToolDefinition,
  accessRequestToolDefinition,
  accessStatusToolDefinition,
  accessContinueToolDefinition,
  accessRequestBatchToolDefinition,
] as const;

export const allToolDefinitions = [
  ...directoryToolDefinitions,
  auditToolDefinition,
  ...accountToolDefinitions,
] as const;

const ACCOUNT_TOOL_SET = new Set<string>(ACCOUNT_TOOL_NAMES);

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

export function accountUnavailableResult(): CallToolResult {
  return {
    content: [{
      type: 'text',
      text: 'Account tools (sign-in, SOC 2 analysis, and access requests) run on the local stdio server (npx -y @trustlists/mcp) so they can read ~/.trustlists/auth.json and local files. This hosted endpoint only serves the public directory tools.',
    }],
    isError: true,
  };
}

export async function executeTool(
  name: string,
  args: unknown,
  options: { allowAudit?: boolean; allowAccount?: boolean } = {},
): Promise<CallToolResult> {
  const allowAudit = options.allowAudit !== false;
  const allowAccount = options.allowAccount === true;

  if (ACCOUNT_TOOL_SET.has(name) && !allowAccount) {
    return accountUnavailableResult();
  }

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
      case 'trustlists_login':
        return jsonResult(await runLogin(loginInputSchema.parse(args ?? {})));
      case 'trustlists_logout':
        return jsonResult(await runLogout(logoutInputSchema.parse(args ?? {})));
      case 'trustlists_whoami':
        return jsonResult(await runWhoami(whoamiInputSchema.parse(args ?? {})));
      case 'trustlists_soc2_analyze':
        return jsonResult(await runSoc2Analyze(soc2AnalyzeInputSchema.parse(args ?? {})));
      case 'trustlists_soc2_status':
        return jsonResult(await runSoc2Status(soc2StatusInputSchema.parse(args ?? {})));
      case 'trustlists_soc2_report':
        return jsonResult(await runSoc2Report(soc2ReportInputSchema.parse(args ?? {})));
      case 'trustlists_requester_profile':
        return jsonResult(await runRequesterProfile(requesterProfileInputSchema.parse(args ?? {})));
      case 'trustlists_access_request':
        return jsonResult(await runAccessRequest(accessRequestInputSchema.parse(args ?? {})));
      case 'trustlists_access_status':
        return jsonResult(await runAccessStatus(accessStatusInputSchema.parse(args ?? {})));
      case 'trustlists_access_continue':
        return jsonResult(await runAccessContinue(accessContinueInputSchema.parse(args ?? {})));
      case 'trustlists_access_request_batch':
        return jsonResult(await runAccessRequestBatch(accessRequestBatchInputSchema.parse(args ?? {})));
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof NotSignedInError) {
      return {
        content: [{
          type: 'text',
          text: error.message || 'Not signed in. Run trustlists_login first.',
        }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Tool ${name} failed: ${message}` }],
      isError: true,
    };
  }
}
