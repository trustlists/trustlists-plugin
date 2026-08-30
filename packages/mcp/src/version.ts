export const SERVER_NAME = 'trustlists';
export const SERVER_VERSION = '0.2.1';

export const PUBLIC_TOOL_NAMES = [
  'trustlists_search',
  'trustlists_lookup',
  'trustlists_browse',
] as const;

/** Needs filesystem access, so it only ships on the stdio server. */
export const LOCAL_ONLY_TOOL_NAMES = ['trustlists_audit_dependencies'] as const;

export const ALL_TOOL_NAMES = [...PUBLIC_TOOL_NAMES, ...LOCAL_ONLY_TOOL_NAMES] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];
