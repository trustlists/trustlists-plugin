export const SERVER_NAME = 'trustlists';
export const SERVER_VERSION = '0.2.1';

export const PUBLIC_TOOL_NAMES = [
  'trustlists_search',
  'trustlists_lookup',
  'trustlists_browse',
] as const;

export type PublicToolName = (typeof PUBLIC_TOOL_NAMES)[number];
