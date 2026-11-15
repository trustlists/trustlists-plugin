import { HOSTED_TOOL_NAMES, STDIO_TOOL_NAMES } from './version.js';

export const TOOL_ANNOTATION_KEYS = [
  'readOnlyHint',
  'destructiveHint',
  'idempotentHint',
  'openWorldHint',
] as const;

export type ToolAnnotationKey = (typeof TOOL_ANNOTATION_KEYS)[number];
export type ToolTransport = 'stdio' | 'hosted';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolMetadata {
  name: string;
  title: string;
  annotations: ToolAnnotations;
  justification: string;
  transports: readonly ToolTransport[];
}

interface ToolMetadataEntry {
  title: string;
  annotations: ToolAnnotations;
  justification: string;
}

const ENTRIES: Record<string, ToolMetadataEntry> = {
  trustlists_search: {
    title: 'Search trust centers',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    justification: 'Searches the public directory by company name or domain and does not change any record.',
  },
  trustlists_lookup: {
    title: 'Look up a vendor',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    justification: 'Reads one public directory record by domain and does not contact the vendor.',
  },
  trustlists_browse: {
    title: 'Browse the directory',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    justification: 'Filters public directory labels. A listed framework is not a certification.',
  },
  trustlists_audit_dependencies: {
    title: 'Map dependency trust centers',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    justification: 'Maps dependency names to public directory records. It does not install packages or score security. Local mode can read named manifest files. Hosted mode accepts only manifest text supplied by the caller.',
  },
  trustlists_login: {
    title: 'Sign in',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    justification: 'Starts or replaces the local trustlists session and can overwrite credentials stored on this machine.',
  },
  trustlists_logout: {
    title: 'Sign out',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    justification: 'Deletes the local session. Repeating it has no further effect once the credentials are gone.',
  },
  trustlists_whoami: {
    title: 'Show signed-in account',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    justification: 'Reads the connected account, credits, and requester-profile status. It does not change them.',
  },
  trustlists_soc2_analyze: {
    title: 'Analyze a SOC 2 PDF',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    justification: 'A confirmed call spends Companion credits and queues analysis of a local PDF. The first call is only a cost preview.',
  },
  trustlists_soc2_upload: {
    title: 'Open SOC 2 upload',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    justification: 'Returns the trustlists upload link. It does not read a local file or spend credits by itself.',
  },
  trustlists_soc2_status: {
    title: 'Check SOC 2 analysis',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    justification: 'Reads analysis job status for the connected account.',
  },
  trustlists_soc2_report: {
    title: 'Read a SOC 2 analysis',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    justification: 'Reads a completed analysis that already belongs to the connected account.',
  },
  trustlists_requester_profile: {
    title: 'Update requester profile',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    justification: 'Reads or replaces the connected account profile used on later vendor forms. Repeating the same values leaves the same profile. It does not submit a vendor request.',
  },
  trustlists_access_request: {
    title: 'Request trust-center access',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    justification: 'Can submit a request to a vendor trust-center portal after confirm is true. The first call only previews. Submission is hard to undo.',
  },
  trustlists_access_status: {
    title: 'Check access requests',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    justification: 'Reads access-request status for the connected account, including a live browser URL when the vendor portal is waiting.',
  },
  trustlists_access_continue: {
    title: 'Resume access request',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    justification: 'Hands a paused vendor-portal request back to the runner. That continues an external submission.',
  },
  trustlists_access_request_batch: {
    title: 'Request access in a batch',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    justification: 'Can submit up to five vendor access requests after one confirmation. The first call only previews.',
  },
};

function transportsFor(name: string): ToolTransport[] {
  const transports: ToolTransport[] = [];
  if ((STDIO_TOOL_NAMES as readonly string[]).includes(name)) transports.push('stdio');
  if ((HOSTED_TOOL_NAMES as readonly string[]).includes(name)) transports.push('hosted');
  return transports;
}

function assertAnnotations(name: string, annotations: ToolAnnotations): void {
  for (const key of TOOL_ANNOTATION_KEYS) {
    if (typeof annotations[key] !== 'boolean') {
      throw new Error(`${name} ${key} must be explicit`);
    }
  }
  if (annotations.readOnlyHint && annotations.destructiveHint) {
    throw new Error(`${name} cannot be read-only and destructive`);
  }
  if (annotations.readOnlyHint && !annotations.idempotentHint) {
    throw new Error(`${name} read-only tools must be idempotent`);
  }
  if (!annotations.readOnlyHint && annotations.destructiveHint && annotations.idempotentHint && name !== 'trustlists_logout') {
    throw new Error(`${name} combines a consequential action with idempotence unexpectedly`);
  }
}

function assertCatalog(): void {
  const published = new Set<string>([...STDIO_TOOL_NAMES, ...HOSTED_TOOL_NAMES]);
  const documented = new Set(Object.keys(ENTRIES));
  for (const name of published) {
    if (!documented.has(name)) throw new Error(`Missing marketplace metadata for ${name}`);
  }
  for (const name of documented) {
    if (!published.has(name)) throw new Error(`${name} is not in a published tool set`);
    const entry = ENTRIES[name];
    if (!entry.title.trim() || entry.title.length > 64) {
      throw new Error(`${name} title must be present and no more than 64 characters`);
    }
    if (!entry.justification.trim()) throw new Error(`${name} needs a review justification`);
    assertAnnotations(name, entry.annotations);
    if (transportsFor(name).length === 0) throw new Error(`${name} has no transport`);
  }
}

assertCatalog();

export function getToolMetadata(name: string, transport: ToolTransport): ToolMetadata {
  const entry = ENTRIES[name];
  const transports = transportsFor(name);
  if (!entry || !transports.includes(transport)) {
    throw new Error(`${name} is not available on the ${transport} server`);
  }
  return {
    name,
    title: entry.title,
    annotations: { ...entry.annotations },
    justification: entry.justification,
    transports,
  };
}

export function annotateToolDefinition<T extends { name: string }>(
  definition: T,
  transport: ToolTransport,
): T & { title: string; annotations: ToolAnnotations } {
  const metadata = getToolMetadata(definition.name, transport);
  return {
    ...definition,
    title: metadata.title,
    annotations: metadata.annotations,
  };
}

export function listToolMetadata(transport?: ToolTransport): ToolMetadata[] {
  return Object.keys(ENTRIES)
    .filter((name) => !transport || transportsFor(name).includes(transport))
    .sort()
    .map((name) => getToolMetadata(name, transport || transportsFor(name)[0]));
}
