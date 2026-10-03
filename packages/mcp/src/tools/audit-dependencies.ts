/**
 * trustlists_audit_dependencies: scan a project's dependency manifests and
 * map each dependency to its vendor's trust center.
 *
 * Supports:
 *   - package.json (npm/yarn/pnpm)
 *   - requirements.txt, pyproject.toml, Pipfile (Python)
 *   - go.mod (Go)
 *   - Cargo.toml (Rust)
 *   - Gemfile (Ruby)
 *   - composer.json (PHP)
 *
 * Returns a structured inventory so the host AI (Cursor/Claude) can describe
 * public security-documentation visibility without inventing a risk score.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getRegistry, normalizeDomain, type RegistryEntry } from '../api/client.js';

export const SUPPORTED_MANIFESTS = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'Pipfile',
  'go.mod',
  'Cargo.toml',
  'Gemfile',
  'composer.json',
] as const;

const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_MANIFESTS = 20;

const manifestSchema = z.object({
  fileName: z.string().min(1)
    .describe(`Manifest file name, for example package.json. Supported: ${SUPPORTED_MANIFESTS.join(', ')}.`),
  content: z.string().max(MAX_MANIFEST_BYTES)
    .describe('Full text of the manifest file.'),
});

export const auditManifestsInputSchema = z.object({
  manifests: z.array(manifestSchema).min(1).max(MAX_MANIFESTS)
    .describe('Dependency manifests pasted or uploaded by the user.'),
  includeDevDependencies: z.boolean().optional().default(false),
});

export const auditInputSchema = z.object({
  projectPath: z.string().min(1).optional(),
  manifests: auditManifestsInputSchema.shape.manifests.optional(),
  includeDevDependencies: z.boolean().optional().default(false),
}).refine((value) => Boolean(value.projectPath || value.manifests?.length), {
  message: 'Provide projectPath or manifests',
});

export type AuditInput = z.infer<typeof auditInputSchema>;

interface DiscoveredDependency {
  name: string;
  manager: string;
  scope: 'runtime' | 'dev';
  rawSpec?: string;
}

interface AuditedDependency {
  name: string;
  manager: string;
  scope: 'runtime' | 'dev';
  vendor?: string;
  domain?: string;
  hasTrustCenter: boolean;
  trustCenter?: string;
  platform?: string;
  certifications: string[];
  csaStarLevel?: number;
  matchType: 'exact' | 'heuristic' | 'unknown';
}

export interface AuditToolResult {
  projectPath: string;
  scannedFiles: string[];
  totalDependencies: number;
  withTrustCenters: number;
  withoutTrustCenters: number;
  unknownVendor: number;
  byManager: Record<string, number>;
  results: AuditedDependency[];
  message: string;
}

interface ManifestSource {
  read: ManifestReader;
  /** Overrides the scanner's file name in scannedFiles, e.g. frontend/package.json. */
  label?: string;
}

/** One source per supplied manifest, so two package.json files are both scanned. */
function manifestSources(manifests: NonNullable<AuditInput['manifests']>): ManifestSource[] {
  return manifests.map((manifest) => {
    const base = manifest.fileName.split(/[\\/]/).pop() || manifest.fileName;
    return {
      label: manifest.fileName,
      read: async (fileName) => {
        if (fileName !== base) throw new Error(`${fileName} not provided`);
        return manifest.content;
      },
    };
  });
}

export async function runAudit(input: AuditInput): Promise<AuditToolResult> {
  const fromManifests = !input.projectPath && Boolean(input.manifests?.length);
  const projectRoot = fromManifests ? 'provided manifests' : path.resolve(input.projectPath || '.');
  const sources: ManifestSource[] = fromManifests
    ? manifestSources(input.manifests || [])
    : [{ read: (fileName) => fs.readFile(path.join(projectRoot, fileName), 'utf8') }];

  const scanners: Array<(read: ManifestReader, includeDev: boolean) => Promise<{ file: string; deps: DiscoveredDependency[] } | null>> = [
    scanPackageJson,
    scanRequirementsTxt,
    scanPyprojectToml,
    scanPipfile,
    scanGoMod,
    scanCargoToml,
    scanGemfile,
    scanComposerJson,
  ];

  const scannedFiles: string[] = [];
  const allDeps: DiscoveredDependency[] = [];

  for (const source of sources) {
    for (const scanner of scanners) {
      try {
        const result = await scanner(source.read, input.includeDevDependencies);
        if (result) {
          scannedFiles.push(source.label || result.file);
          allDeps.push(...result.deps);
        }
      } catch {
        // skip this scanner; partial scans are better than no scan
      }
    }
  }

  if (scannedFiles.length === 0) {
    return {
      projectPath: projectRoot,
      scannedFiles: [],
      totalDependencies: 0,
      withTrustCenters: 0,
      withoutTrustCenters: 0,
      unknownVendor: 0,
      byManager: {},
      results: [],
      message: fromManifests
        ? `None of the provided manifests could be read. Supported: ${SUPPORTED_MANIFESTS.join(', ')}.`
        : `No supported dependency manifests found in ${projectRoot}. Looked for ${SUPPORTED_MANIFESTS.join(', ')}.`,
    };
  }

  const dedupedDeps = dedupeDependencies(allDeps);
  // A missing registry is not the same thing as zero matched vendors. Let the
  // MCP error boundary report the outage rather than returning a plausible but
  // false "0/N have trust centers" result.
  const registry = await getRegistry();
  const audited = await Promise.all(dedupedDeps.map((dep) => auditDependency(dep, registry)));

  const withTrustCenters = audited.filter((a) => a.hasTrustCenter).length;
  const unknown = audited.filter((a) => a.matchType === 'unknown').length;
  const withoutTrustCenters = audited.length - withTrustCenters;

  const byManager: Record<string, number> = {};
  for (const dep of audited) {
    byManager[dep.manager] = (byManager[dep.manager] || 0) + 1;
  }

  return {
    projectPath: projectRoot,
    scannedFiles,
    totalDependencies: audited.length,
    withTrustCenters,
    withoutTrustCenters,
    unknownVendor: unknown,
    byManager,
    results: audited,
    message: `Scanned ${scannedFiles.length} manifest${scannedFiles.length === 1 ? '' : 's'}. ${withTrustCenters}/${audited.length} dependencies map to trust centers in the trustlists directory.`,
  };
}

function dedupeDependencies(deps: DiscoveredDependency[]): DiscoveredDependency[] {
  const seen = new Map<string, DiscoveredDependency>();
  for (const dep of deps) {
    const key = `${dep.manager}:${dep.name.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, dep);
  }
  return Array.from(seen.values());
}

async function auditDependency(dep: DiscoveredDependency, registry: RegistryEntry[]): Promise<AuditedDependency> {
  const candidates = guessVendorDomains(dep.name, dep.manager);

  for (const candidate of candidates) {
    const match = registry.find((entry) => normalizeDomain(entry.website) === candidate);
    if (match) {
      return {
        name: dep.name,
        manager: dep.manager,
        scope: dep.scope,
        vendor: match.name,
        domain: candidate,
        hasTrustCenter: true,
        trustCenter: match.trustCenter,
        platform: match.platform,
        certifications: match.certifications || [],
        csaStarLevel: match.csaStar?.level,
        matchType: candidate === candidates[0] ? 'exact' : 'heuristic',
      };
    }
  }

  return {
    name: dep.name,
    manager: dep.manager,
    scope: dep.scope,
    hasTrustCenter: false,
    certifications: [],
    matchType: 'unknown',
  };
}

/**
 * Map a package name to likely vendor domains. The first candidate is the
 * highest-confidence guess; subsequent ones are fallbacks.
 *
 * Examples:
 *   "@stripe/stripe-js"      → ["stripe.com"]                       (npm scope === vendor)
 *   "@anthropic-ai/sdk"      → ["anthropic.com"]                    (npm scope override)
 *   "datadog-api-client"     → ["datadoghq.com"]                    (well-known package override)
 *   "boto3"                  → ["amazon.com"]                       (well-known package override)
 *   "next"                   → ["vercel.com"]                       (well-known package override)
 *   "github.com/stripe/sdk"  → ["stripe.com"]                       (go module heuristic)
 *   "lodash"                 → []                                   (no obvious vendor)
 */
function guessVendorDomains(packageName: string, manager: string): string[] {
  const lower = packageName.toLowerCase();

  // 1. Exact package-name overrides (highest confidence).
  const overrides = WELL_KNOWN_VENDOR_DOMAINS[lower];
  if (overrides && overrides.length) return overrides;

  const candidates: string[] = [];

  if (manager === 'npm' && lower.startsWith('@')) {
    const scope = lower.slice(1).split('/')[0];
    if (scope) {
      // 2. Scope-level overrides for cases where scope ≠ "<vendor>.com"
      //    e.g. @anthropic-ai → anthropic.com, @azure → microsoft.com
      const scopeOverride = NPM_SCOPE_OVERRIDES[scope];
      if (scopeOverride) {
        candidates.push(scopeOverride);
      } else {
        // 3. Default npm scope heuristic: @stripe/* → stripe.com
        candidates.push(`${scope}.com`);
      }
    }
  }

  // Go: github.com/stripe/stripe-go → stripe.com
  if (manager === 'go' && lower.startsWith('github.com/')) {
    const owner = lower.split('/')[1];
    if (owner) {
      candidates.push(`${owner}.com`);
      candidates.push(`${owner}.io`);
    }
  }

  // Ruby gems: stripe → stripe.com
  if (manager === 'rubygems') {
    candidates.push(`${lower}.com`);
  }

  return [...new Set(candidates)];
}

/**
 * Override map for npm scopes whose name doesn't equal "<vendor>.com".
 * These map a scope (without the "@") directly to a vendor domain so all
 * packages under that scope inherit the mapping.
 */
const NPM_SCOPE_OVERRIDES: Record<string, string> = {
  // AI / ML
  'anthropic-ai': 'anthropic.com',
  'cohere-ai': 'cohere.com',
  mistralai: 'mistral.ai',
  huggingface: 'huggingface.co',
  // Cloud / infra
  azure: 'microsoft.com',
  'aws-sdk': 'amazon.com',
  'aws-amplify': 'amazon.com',
  'google-cloud': 'cloud.google.com',
  'google-ai': 'cloud.google.com',
  firebase: 'firebase.google.com',
  neondatabase: 'neon.tech',
  planetscale: 'planetscale.com',
  // Auth
  'workos-inc': 'workos.com',
  'kinde-oss': 'kinde.com',
  // Communications
  resend: 'resend.com',
  // Databases
  prisma: 'prisma.io',
  // Misc
  octokit: 'github.com',
  brandfetch: 'brandfetch.com',
  mailchimp: 'mailchimp.com',
  vonage: 'vonage.com',
};

/**
 * Curated mapping for unscoped or oddly-named packages whose name doesn't
 * obviously match the vendor domain. Keys are lowercased package names.
 *
 * Some entries map to a domain that isn't (yet) in the trustlists directory.
 * that's fine; the audit will return "unknown" and we'll add to the registry
 * over time.
 */
const WELL_KNOWN_VENDOR_DOMAINS: Record<string, string[]> = {
  // ============================================================
  // AI / ML
  // ============================================================
  openai: ['openai.com'],
  anthropic: ['anthropic.com'],
  cohere: ['cohere.com'],
  replicate: ['replicate.com'],
  // ============================================================
  // Cloud / infrastructure
  // ============================================================
  next: ['vercel.com'],
  vercel: ['vercel.com'],
  netlify: ['netlify.com'],
  cloudflare: ['cloudflare.com'],
  wrangler: ['cloudflare.com'],
  upstash: ['upstash.com'],
  neon: ['neon.tech'],
  supabase: ['supabase.com'],
  'firebase-admin': ['firebase.google.com'],
  // AWS
  boto3: ['amazon.com'],
  botocore: ['amazon.com'],
  'aws-sdk': ['amazon.com'],
  'aws-sdk-js': ['amazon.com'],
  'aws-amplify': ['amazon.com'],
  'aws-cdk-lib': ['amazon.com'],
  // ============================================================
  // Auth / identity
  // ============================================================
  'auth0-js': ['auth0.com'],
  // ============================================================
  // Payments
  // ============================================================
  stripe: ['stripe.com'],
  'stripe-go': ['stripe.com'],
  braintree: ['braintreepayments.com'],
  // ============================================================
  // Observability / analytics
  // ============================================================
  newrelic: ['newrelic.com'],
  logrocket: ['logrocket.com'],
  fullstory: ['fullstory.com'],
  mixpanel: ['mixpanel.com'],
  'mixpanel-browser': ['mixpanel.com'],
  amplitude: ['amplitude.com'],
  'analytics-node': ['segment.com'],
  'posthog-js': ['posthog.com'],
  'posthog-node': ['posthog.com'],
  'datadog-api-client': ['datadoghq.com'],
  'dd-trace': ['datadoghq.com'],
  'datadog-lambda-js': ['datadoghq.com'],
  'sentry-sdk': ['sentry.io'],
  // ============================================================
  // Communications / email / SMS
  // ============================================================
  twilio: ['twilio.com'],
  sendgrid: ['sendgrid.com'],
  postmark: ['postmarkapp.com'],
  resend: ['resend.com'],
  'mailgun-js': ['mailgun.com'],
  'mailgun.js': ['mailgun.com'],
  plivo: ['plivo.com'],
  'discord.js': ['discord.com'],
  // ============================================================
  // Databases / caches / queues
  // ============================================================
  mongodb: ['mongodb.com'],
  mongoose: ['mongodb.com'],
  redis: ['redis.io'],
  ioredis: ['redis.io'],
  fauna: ['fauna.com'],
  faunadb: ['fauna.com'],
  prisma: ['prisma.io'],
  kafkajs: ['confluent.io'],
  'kafka-node': ['confluent.io'],
  // ============================================================
  // Search
  // ============================================================
  algoliasearch: ['algolia.com'],
  meilisearch: ['meilisearch.com'],
  // ============================================================
  // CMS / marketing / CRM
  // ============================================================
  hubspot: ['hubspot.com'],
  'intercom-client': ['intercom.com'],
  airtable: ['airtable.com'],
  contentful: ['contentful.com'],
  'contentful-management': ['contentful.com'],
  sanity: ['sanity.io'],
  // ============================================================
  // Other SaaS
  // ============================================================
  pagerduty: ['pagerduty.com'],
  octokit: ['github.com'],
};

// ---------- Manifest scanners ----------

type ManifestReader = (fileName: string) => Promise<string>;

async function scanPackageJson(read: ManifestReader, includeDev: boolean) {
  const text = await read('package.json');
  const json = JSON.parse(text);
  const deps: DiscoveredDependency[] = [];

  for (const [name, spec] of Object.entries(json.dependencies || {})) {
    deps.push({ name, manager: 'npm', scope: 'runtime', rawSpec: String(spec) });
  }
  if (includeDev) {
    for (const [name, spec] of Object.entries(json.devDependencies || {})) {
      deps.push({ name, manager: 'npm', scope: 'dev', rawSpec: String(spec) });
    }
  }
  for (const [name, spec] of Object.entries(json.peerDependencies || {})) {
    deps.push({ name, manager: 'npm', scope: 'runtime', rawSpec: String(spec) });
  }

  return { file: 'package.json', deps };
}

async function scanRequirementsTxt(read: ManifestReader, _includeDev: boolean) {
  const text = await read('requirements.txt');
  const deps: DiscoveredDependency[] = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const name = trimmed.split(/[<>=!~\s;]/)[0].toLowerCase();
    if (name) deps.push({ name, manager: 'pypi', scope: 'runtime' });
  }

  return { file: 'requirements.txt', deps };
}

async function scanPyprojectToml(read: ManifestReader, includeDev: boolean) {
  const text = await read('pyproject.toml');
  const deps: DiscoveredDependency[] = [];

  // Lightweight TOML parsing for [project.dependencies] and [tool.poetry.dependencies].
  const dependencyArray = matchTomlArray(text, /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
  for (const entry of dependencyArray) {
    const name = entry.replace(/^['"]/, '').split(/[<>=!~\s;]/)[0].toLowerCase();
    if (name) deps.push({ name, manager: 'pypi', scope: 'runtime' });
  }

  const poetryRuntime = matchTomlSection(text, /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/);
  for (const name of poetryRuntime) {
    if (name === 'python') continue;
    deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'runtime' });
  }

  if (includeDev) {
    const poetryDev = matchTomlSection(text, /\[tool\.poetry\.dev-dependencies\]([\s\S]*?)(?:\n\[|$)/);
    for (const name of poetryDev) {
      if (name === 'python') continue;
      deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'dev' });
    }
  }

  return { file: 'pyproject.toml', deps };
}

function matchTomlArray(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match || !match[1]) return [];
  return match[1]
    .split(/,/)
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function matchTomlSection(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match || !match[1]) return [];
  const names: string[] = [];
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim().replace(/^['"]|['"]$/g, '');
    if (name) names.push(name);
  }
  return names;
}

async function scanPipfile(read: ManifestReader, includeDev: boolean) {
  const text = await read('Pipfile');
  const deps: DiscoveredDependency[] = [];

  const runtime = matchTomlSection(text, /\[packages\]([\s\S]*?)(?:\n\[|$)/);
  for (const name of runtime) {
    deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'runtime' });
  }

  if (includeDev) {
    const dev = matchTomlSection(text, /\[dev-packages\]([\s\S]*?)(?:\n\[|$)/);
    for (const name of dev) {
      deps.push({ name: name.toLowerCase(), manager: 'pypi', scope: 'dev' });
    }
  }

  return { file: 'Pipfile', deps };
}

async function scanGoMod(read: ManifestReader, _includeDev: boolean) {
  const text = await read('go.mod');
  const deps: DiscoveredDependency[] = [];

  // require ( ... ) blocks and single-line require statements.
  const requireBlock = text.match(/require\s+\(([\s\S]*?)\)/);
  if (requireBlock && requireBlock[1]) {
    for (const line of requireBlock[1].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const name = trimmed.split(/\s+/)[0];
      if (name) deps.push({ name: name.toLowerCase(), manager: 'go', scope: 'runtime' });
    }
  }

  for (const m of text.matchAll(/^require\s+(\S+)\s+\S+/gm)) {
    if (m[1]) deps.push({ name: m[1].toLowerCase(), manager: 'go', scope: 'runtime' });
  }

  return { file: 'go.mod', deps };
}

async function scanCargoToml(read: ManifestReader, includeDev: boolean) {
  const text = await read('Cargo.toml');
  const deps: DiscoveredDependency[] = [];

  const runtime = matchTomlSection(text, /\[dependencies\]([\s\S]*?)(?:\n\[|$)/);
  for (const name of runtime) {
    deps.push({ name: name.toLowerCase(), manager: 'cargo', scope: 'runtime' });
  }

  if (includeDev) {
    const dev = matchTomlSection(text, /\[dev-dependencies\]([\s\S]*?)(?:\n\[|$)/);
    for (const name of dev) {
      deps.push({ name: name.toLowerCase(), manager: 'cargo', scope: 'dev' });
    }
  }

  return { file: 'Cargo.toml', deps };
}

async function scanGemfile(read: ManifestReader, _includeDev: boolean) {
  const text = await read('Gemfile');
  const deps: DiscoveredDependency[] = [];

  for (const line of text.split('\n')) {
    const match = line.match(/^\s*gem\s+['"]([^'"]+)['"]/);
    if (match && match[1]) {
      deps.push({ name: match[1].toLowerCase(), manager: 'rubygems', scope: 'runtime' });
    }
  }

  return { file: 'Gemfile', deps };
}

async function scanComposerJson(read: ManifestReader, includeDev: boolean) {
  const text = await read('composer.json');
  const json = JSON.parse(text);
  const deps: DiscoveredDependency[] = [];

  for (const name of Object.keys(json.require || {})) {
    if (name === 'php' || name.startsWith('ext-')) continue;
    deps.push({ name: name.toLowerCase(), manager: 'composer', scope: 'runtime' });
  }
  if (includeDev) {
    for (const name of Object.keys(json['require-dev'] || {})) {
      if (name === 'php' || name.startsWith('ext-')) continue;
      deps.push({ name: name.toLowerCase(), manager: 'composer', scope: 'dev' });
    }
  }

  return { file: 'composer.json', deps };
}

export const auditToolDefinition = {
  name: 'trustlists_audit_dependencies',
  description:
    "Scan a project's dependency manifests (package.json, requirements.txt, go.mod, Cargo.toml, Gemfile, composer.json, pyproject.toml, Pipfile) and map likely vendors to public trust center records. Returns documentation-visibility data, not a security score. Use when inventorying third-party services or preparing vendor review.",
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the project root containing dependency manifests.',
      },
      manifests: {
        type: 'array',
        description: 'Alternatively, manifest files as text: [{ fileName, content }].',
        items: {
          type: 'object',
          properties: {
            fileName: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['fileName', 'content'],
        },
      },
      includeDevDependencies: {
        type: 'boolean',
        description: 'If true, include devDependencies / dev-packages / dev-dependencies. Default false.',
        default: false,
      },
    },
  },
} as const;

/** The hosted endpoint cannot read the user's disk, so it only takes manifest text. */
export const auditManifestsDescription =
  `Map a project's dependencies to public vendor trust center records. Pass the text of one or more manifests (${SUPPORTED_MANIFESTS.join(', ')}); ask the user to paste or upload them. Returns documentation-visibility data, not a security score.`;
