export const SERVER_NAME = 'trustlists';
export const SERVER_VERSION = '0.4.0';

export const PUBLIC_TOOL_NAMES = [
  'trustlists_search',
  'trustlists_lookup',
  'trustlists_browse',
] as const;

/** Signed-in tools. Never run unless the caller allows account access. */
export const ACCOUNT_TOOL_NAMES = [
  'trustlists_login',
  'trustlists_logout',
  'trustlists_whoami',
  'trustlists_soc2_analyze',
  'trustlists_soc2_upload',
  'trustlists_soc2_status',
  'trustlists_soc2_report',
  'trustlists_requester_profile',
  'trustlists_access_request',
  'trustlists_access_status',
  'trustlists_access_continue',
  'trustlists_access_request_batch',
] as const;

/** Served by the stdio server (npx -y @trustlists/mcp). */
export const STDIO_TOOL_NAMES = [
  ...PUBLIC_TOOL_NAMES,
  'trustlists_audit_dependencies',
  'trustlists_login',
  'trustlists_logout',
  'trustlists_whoami',
  'trustlists_soc2_analyze',
  'trustlists_soc2_status',
  'trustlists_soc2_report',
  'trustlists_requester_profile',
  'trustlists_access_request',
  'trustlists_access_status',
  'trustlists_access_continue',
  'trustlists_access_request_batch',
] as const;

/**
 * Served by the hosted endpoint after OAuth sign-in. Connecting the app
 * replaces login/logout, and uploads in the trustlists app replace local PDF
 * paths for SOC 2 analysis.
 */
export const HOSTED_TOOL_NAMES = [
  ...PUBLIC_TOOL_NAMES,
  'trustlists_audit_dependencies',
  'trustlists_whoami',
  'trustlists_soc2_upload',
  'trustlists_soc2_status',
  'trustlists_soc2_report',
  'trustlists_requester_profile',
  'trustlists_access_request',
  'trustlists_access_status',
  'trustlists_access_continue',
  'trustlists_access_request_batch',
] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];
