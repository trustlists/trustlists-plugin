export const SERVER_NAME = 'trustlists';
export const SERVER_VERSION = '0.3.0';

export const PUBLIC_TOOL_NAMES = [
  'trustlists_search',
  'trustlists_lookup',
  'trustlists_browse',
] as const;

/** Needs a local filesystem or the stored Companion session, so stdio only. */
export const ACCOUNT_TOOL_NAMES = [
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

/** Needs filesystem access, so it only ships on the stdio server. */
export const LOCAL_ONLY_TOOL_NAMES = [
  'trustlists_audit_dependencies',
  ...ACCOUNT_TOOL_NAMES,
] as const;

export const ALL_TOOL_NAMES = [...PUBLIC_TOOL_NAMES, ...LOCAL_ONLY_TOOL_NAMES] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];
